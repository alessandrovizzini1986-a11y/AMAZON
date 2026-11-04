import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { canoniFatturati, riconcilia, sceltaCanone, statoDaLista, type FatturaRiga, type ListaRiga, type VeicoloSito } from "@/domain/flotta/riconcilia";
import { leggiFattureAld, leggiFattureArval, leggiFattureAvis, leggiFattureEuropcar, leggiListaAttivi, leggiListaCessati, numero, type Matrice } from "@/lib/flotta/leggi";

const L = (p: Partial<ListaRiga>): ListaRiga => ({ targa: "AA111AA", station: "DLO2", marca: "Ford", modello: "Transit", stato: "Attivo", societa: "ALD MT", tipo: "MT", ra: null, inizio: "2026-10-01", fine: null, note: null, tariffa: 900, franchigiaDanni: null, ...p });
const V = (p: Partial<VeicoloSito>): VeicoloSito => ({ id: "v", targa: "AA111AA", station: "DLO2", stato: "ATTIVO", modello: "Ford Transit", leasingCompany: "ALD MT", tipoContratto: "MT", contrattoLeasingNo: null, contrattoDataInizio: "2026-10-01", contrattoDataFine: null, canoneMese: 900, note: null, franchigiaDanni: null, ...p });
const F = (p: Partial<FatturaRiga>): FatturaRiga => ({ fornitore: "ALD", fattura: "X", targa: "AA111AA", voce: "CANONE", dal: "2026-10-01", al: "2026-10-31", mese: "2026-10", importo: 720, mesePieno: true, cdc: "5569", ...p });

describe("flotta: regole", () => {
  it("stato dalla Lista e numeri italiani", () => {
    expect(["Attivo", "sost", "Sostitutivo ", "Ufficio"].map(statoDaLista)).toEqual(["ATTIVO", "SOSTITUTIVO", "SOSTITUTIVO", "UFFICIO"]);
    expect([numero("1.234,50"), numero("€ 900"), numero("#ERROR!"), numero(" - ")]).toEqual([1234.5, 900, null, null]);
  });
  it("canone: fattura di mese pieno > Lista > sito; frazioni di mese ignorate", () => {
    const c = canoniFatturati([F({ mese: "2026-09", dal: "2026-09-20", al: "2026-09-30", importo: 270, mesePieno: false }), F({})]);
    expect(c.get("ALD|AA111AA")).toMatchObject({ importo: 720, mese: "2026-10" });
    expect(sceltaCanone(L({}), c.get("ALD|AA111AA")!, 500)).toMatchObject({ scelto: 720 });
    expect(sceltaCanone(L({ tariffa: null }), null, 500)).toMatchObject({ scelto: 500, fonte: "sito (invariato)" });
    // note di credito / canone a 0 ignorati; rateo (mese "pieno" < 50 % del precedente) → precedente
    const d = canoniFatturati([F({ mese: "2026-09", dal: "2026-09-01", al: "2026-09-30", importo: 640 }), F({ importo: 185.82 }), F({ importo: -640 }), F({ targa: "ZERO0AA", importo: 0 })]);
    expect(d.get("ALD|AA111AA")).toMatchObject({ importo: 640, mese: "2026-09" });
    expect(d.has("ALD|ZERO0AA")).toBe(false);
    // sostitutivi: mai canone, anche se fatturati (→ anomalia)
    expect(sceltaCanone(L({ stato: "Sostitutivo", tariffa: 900 }), c.get("ALD|AA111AA")!, 900)).toMatchObject({ scelto: null });
    const s = riconcilia({ lista: [L({ stato: "sost", tariffa: 900 })], cessati: [], fatture: [F({})], sito: [V({ stato: "SOSTITUTIVO", canoneMese: 900 })] });
    expect(s.aggiorna[0].cambi).toContainEqual({ campo: "canoneMese", prima: 900, dopo: null });
    expect(s.anomalie.map((a) => a.tipo)).toEqual(["sostitutivo fatturato a canone"]);
  });
  it("nuova, riattivata, uscita confermata, da verificare, IN_OFFICINA intatto", () => {
    const e = riconcilia({
      lista: [L({ targa: "NEW01AA" }), L({ targa: "OLD01AA", stato: "sost" }), L({ targa: "OFF01AA" })],
      cessati: [{ targa: "GONE1AA", station: "DLO2", inizio: "2026-01-01", fine: "2026-10-15", societa: "Hertz" }],
      fatture: [F({ targa: "GONE1AA" })],
      sito: [V({ id: "1", targa: "OLD01AA", stato: "DISMESSO" }), V({ id: "2", targa: "GONE1AA" }), V({ id: "3", targa: "MISS1AA" }), V({ id: "4", targa: "OFF01AA", stato: "IN_OFFICINA", note: "a mano" })],
    });
    expect(e.crea.map((x) => x.lista.targa)).toEqual(["NEW01AA"]);
    expect(e.riattiva.map((x) => [x.veicolo.id, x.cambi.find((c) => c.campo === "stato")?.dopo])).toEqual([["1", "SOSTITUTIVO"]]);
    expect(e.dismetti.map((x) => x.veicolo.id)).toEqual(["2"]);
    expect(e.daVerificare.map((x) => x.veicolo.id)).toEqual(["3"]);
    expect(e.aggiorna.find((x) => x.veicolo.id === "4")).toBeUndefined();
    expect(e.anomalie.map((a) => [a.tipo, a.targa])).toEqual([["fatturata nel mese della cessazione", "GONE1AA"]]);
  });
});

const KIT = path.join(process.cwd(), "docs", "flotta-kit", "esempi");
const k = (f: string) => path.join(KIT, f);
const haKit = fs.existsSync(k("Lista_Targhe_10.02.21.xlsx")) && fs.existsSync(k("sito_veicoli_2026-11-04.json"));

async function matrici(file: string, fogli?: string[]): Promise<Record<string, Matrice>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const out: Record<string, Matrice> = {};
  for (const ws of wb.worksheets) {
    if (fogli && !fogli.includes(ws.name)) continue;
    const m: Matrice = [];
    ws.eachRow({ includeEmpty: true }, (r, n) => { m[n - 1] = (r.values as unknown[]).slice(1); });
    out[ws.name] = Array.from(m, (r) => r ?? []);
  }
  return out;
}

describe.skipIf(!haKit)("flotta: Lista Targhe 04/11/2026 + fatture (file reali)", () => {
  it("nuove 60, uscite 35 + 1 da verificare, anomalie di fatturazione", async () => {
    const lt = await matrici(k("Lista_Targhe_10.02.21.xlsx"), ["Attivi", "Cessati"]);
    const lista = leggiListaAttivi(lt.Attivi), cessati = leggiListaCessati(lt.Cessati);
    expect(lista.length).toBe(768);
    const fatture = [
      ...leggiFattureAld(Object.values(await matrici(k("ALD___YTD_2026.xlsx")))[0]),
      ...leggiFattureArval(Object.values(await matrici(k("ARVAL___OTTOBRE_2026.xlsx")))[0]),
      ...leggiFattureAvis(Object.values(await matrici(k("AVIS_BUDGET__YTD_2026.xlsx")))[0]),
      ...leggiFattureEuropcar((await matrici(k("EUROPCAR__SETTEMBRE_2026.xlsx")))["Professional Solution"]),
    ];
    const snap = JSON.parse(fs.readFileSync(k("sito_veicoli_2026-11-04.json"), "utf8")) as Record<string, unknown>[];
    const sito: VeicoloSito[] = snap.map((x, i) => ({ id: String(i), targa: String(x.targa), station: String(x.st), stato: x.stato as VeicoloSito["stato"], modello: String(x.modello), leasingCompany: (x.leasingCompany as string) ?? null, tipoContratto: (x.tipoContratto as VeicoloSito["tipoContratto"]) ?? null, contrattoLeasingNo: (x.ra as string) ?? null, contrattoDataInizio: (x.inizio as string) ?? null, contrattoDataFine: (x.fine as string) ?? null, canoneMese: (x.canone as number) ?? null, note: (x.note as string) ?? null, franchigiaDanni: null }));
    const e = riconcilia({ lista, cessati, fatture, sito });
    expect(e.crea.length + e.riattiva.length).toBe(60);
    expect(e.dismetti.length).toBe(35);
    expect(e.daVerificare.map((d) => d.veicolo.targa)).toEqual(["GP823SP"]);
    // fatturate da ALD a ottobre dopo la cessazione (da contestare)
    const dopo = e.anomalie.filter((a) => a.tipo === "fatturata dopo la cessazione").map((a) => a.targa).sort();
    expect(dopo).toEqual(expect.arrayContaining(["GD321BF", "GK106FJ", "GK175RD", "GV384ZF"]));
    // nessuno cambia station: la Lista e il sito sono allineati sulle sedi
    expect(e.aggiorna.filter((a) => a.cambi.some((c) => c.campo === "station")).length).toBe(0);
  }, 300_000);
});
