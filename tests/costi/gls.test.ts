import { describe, it, expect } from "vitest";
import fs from "node:fs";
import type { Cell, SheetGrid } from "@/domain/presenze/grid";
import { leggiPresenzeGls, mesePresenzeGls, testeAttive, totaliGriglia, isPresenzeGls } from "@/domain/gls/presenze";
import { controlloBadgebox, isBadgebox, leggiBadgebox, riepilogoBadgebox } from "@/domain/gls/badgebox";
import { accantonamentiGls, bustaGls, festiviGls, oreGls } from "@/domain/gls/costo";
import { leggiAnagraficaCDL, type RigaCDL } from "@/domain/costi/anagrafica";
import { leggiPayroll, totalePayroll } from "@/domain/costi/payroll";
import { festiviAnno } from "@/domain/costi/festivi";
import { excelFOGls, foglioFOGls, rigaNoleggioGls } from "@/lib/costi/excelFOGls";
import { esempio, grids, hasKit } from "./kit";

const sheet = (name: string, rows: Cell[][]): SheetGrid => ({ name, rows, formulas: new Set(), notes: new Map() });
const d = (s: string) => new Date(s + "T00:00:00Z");
const PSIC = { MOLT_ONERI: 1.434, STR_FT: 17.9, STR_PT: 16.1, SUPP: 14.1, DOMFEST: 4.6, MALATTIA_H: -11.46, CARENZA_PCT: 0.635 };
const TAR = [{ voce: "TRASFERTA", validaDal: "2026-01-01", valore: 22.5 }, { voce: "TRASFERTA_DOM_EXTRA", validaDal: "2025-05-01", valore: 7 }, { voce: "TRASFERTA_GLS", validaDal: "2026-01-01", valore: 25 }];

/** File presenze inventato: agosto 2026, 3 persone (2 SIC, 1 STD), 1 cessato il 31/08. */
function presenzeAgosto(): SheetGrid[] {
  const giorni = Array.from({ length: 31 }, (_, i) => d(`2026-08-${String(i + 1).padStart(2, "0")}`));
  const riga = (cf: string, voce: string, val: (i: number) => number) => [cf, "PERSONA " + cf.slice(0, 3), "Autista", voce, ...giorni.map((_, i) => val(i)), voce, 0];
  const feriale = (i: number) => { const g = giorni[i].getUTCDay(); return g !== 0 && g !== 6; };
  const ana = sheet("Anagrafica", [
    ["REFERENTE AREA", "NOME", "COGNOME", "CODICE FISCALE", "FT / PT", "% Contratto", "Qnt. HH Settimanali", "Qnt. HH Giorno", "SIC/STD", "Attivo/Cessato", "Data Inizio", "Data Fine", "Mansione"],
    ["X", "UNO", "ROSSI", "AAAAAA00A00A000A", "FT", 1, 39, 7.8, "SIC", "Attivo", d("2026-01-01"), null, "Autista"],
    ["X", "DUE", "BIANCHI", "BBBBBB00B00B000B", "PT", 0.5886, 24.72, 8, "SIC", "Cessato", d("2026-01-01"), d("2026-08-31"), "Autista"],
    ["X", "TRE", "VERDI", "CCCCCC00C00C000C", "PT", 0.8, 31.2, 7.8, "STD", "Attivo", d("2026-03-01"), null, "Autista"],
  ]);
  const grid = sheet("AGOSTO", [
    [null, "Presenze AGOSTO 2026", null, null, ...giorni],
    [],
    ["Codice Fiscale", "Nome Cognome", "Mansione", "Valore", ...giorni, "Valore", "TOTALI"],
    riga("AAAAAA00A00A000A", "Ordinarie", (i) => (feriale(i) && i < 14 ? 7.8 : 0)),
    riga("AAAAAA00A00A000A", "Straordinari", (i) => (i === 3 ? 2 : 0)),
    riga("AAAAAA00A00A000A", "FERIE", (i) => (feriale(i) && i >= 14 && i < 21 ? 7.8 : 0)),
    riga("AAAAAA00A00A000A", "MALATTIA", (i) => (i === 25 ? 7.8 : 0)),
    riga("AAAAAA00A00A000A", "PNR", (i) => (i === 26 ? 4 : 0)),
    riga("AAAAAA00A00A000A", "Indennità Trasferta", (i) => (feriale(i) && i < 14 ? 1 : 0)),
    riga("BBBBBB00B00B000B", "Ordinarie", (i) => (feriale(i) ? 4.7 : 0)),
    riga("CCCCCC00C00C000C", "Ordinarie", (i) => (feriale(i) ? 6.24 : 0)),
    riga("CCCCCC00C00C000C", "Straordinari", (i) => (i === 1 ? 3 : 0)), // domenica 2/8
    riga("CCCCCC00C00C000C", "Indennità Trasferta", (i) => (feriale(i) ? 1 : 0)),
  ]);
  return [sheet("Presenze", [[]]), grid, ana];
}

const CDL: RigaCDL[] = [
  { cf: "AAAAAA00A00A000A", cognome: "ROSSI", nome: "UNO", station: "GLS", contratto: "", pctPt: 1, hSettim: 39, ggLavorativi: null, tipologiaPt: "", rlm: 2000, edr: null, cdl: 4000, savingFeGg: 100, savingRolH: 10, savingExfH: 10, costoFestNonGodutaGg: null, straoForfait: null },
  { cf: "BBBBBB00B00B000B", cognome: "BIANCHI", nome: "DUE", station: "GLS", contratto: "", pctPt: 0.5886, hSettim: 24.72, ggLavorativi: null, tipologiaPt: "", rlm: 2000, edr: null, cdl: 2400, savingFeGg: 60, savingRolH: 6, savingExfH: 6, costoFestNonGodutaGg: null, straoForfait: null },
];

describe("file presenze GLS (dati inventati)", () => {
  const g = presenzeAgosto();
  it("riconosce il file e il mese, legge anagrafica e griglia", () => {
    expect(isPresenzeGls(g)).toBe(true);
    expect(mesePresenzeGls(g)).toBe("2026-08");
    const p = leggiPresenzeGls(g, "2026-08");
    expect(p.giorni).toHaveLength(31);
    expect(p.griglia).toHaveLength(3);
    expect(testeAttive(p.anagrafica)).toBe(2);
    const t = totaliGriglia(p.griglia);
    expect(t.Straordinari).toBe(5);
    expect(t["Indennità Trasferta"]).toBe(10 + 21);
    expect(p.anagrafica[1]).toMatchObject({ tipo: "SIC", attivo: false, fine: "2026-08-31", pct: 0.5886 });
  });

  it("busta di settembre: CDL dei SIC attivi + variabili di agosto, cessato escluso, assunto pro-rata", () => {
    const ago = leggiPresenzeGls(g, "2026-08");
    const nuovo = { cf: "DDDDDD00D00D000D", nome: "QUATTRO", cognome: "NERI", ftPt: "FT", pct: 1, hSettim: 39, hGiorno: 7.8, tipo: "SIC" as const, attivo: true, inizio: "2026-09-16", fine: null, mansione: "Autista" };
    const b = bustaGls({ mese: "2026-09", variabili: ago, anagMese: [...ago.anagrafica, nuovo], cdl: CDL, par: PSIC, tariffe: TAR, festivi: festiviAnno(2026) });
    expect(b.cessati).toHaveLength(1);
    const r = b.righe.find((x) => x.cf === "AAAAAA00A00A000A")!;
    expect(r.base).toBe(4000);
    expect(r.trasfGg).toBe(10);
    expect(r.trasferta).toBeCloseTo(250, 2); // 10 giorni × 25 € (tariffa GLS)
    expect(r.straordinari).toBeCloseTo(2 * 17.9 * 1.434, 2);
    // 15/8 è sabato: festività non goduta a tutti = RLM/22 × oneri
    expect(r.festGg).toBe(1);
    expect(r.festivita).toBeCloseTo((2000 / 22) * 1.434, 2);
    expect(r.malattia).toBeCloseTo(7.8 * -11.46 * 1.434 * (1 - 0.635), 2);
    expect(r.altreAssenze).toBeCloseTo(-4 * (2000 / (39 * 52 / 12)) * 1.434, 2);
    expect(r.ferieGodute).toBeCloseTo(-5 * 100, 2);
    // assunto il 16/9 senza CDL: CDL medio FT × 15/30
    const n = b.senzaCdl.find((x) => x.inizio === "2026-09-16")!;
    expect(n.contato).toBe(true);
    expect(n.cdl).toBeCloseTo(4000 * 15 / 30, 2);
    expect(b.totali.teste).toBe(2);
  });

  it("chi è attivo da prima del mese ma non è nel CDL non si conta (da verificare)", () => {
    const ago = leggiPresenzeGls(g, "2026-08");
    const b = bustaGls({ mese: "2026-09", variabili: ago, anagMese: [...ago.anagrafica, { ...ago.anagrafica[0], cf: "EEEEEE00E00E000E" }], cdl: CDL, par: PSIC, tariffe: TAR, festivi: [] });
    expect(b.senzaCdl).toEqual([expect.objectContaining({ contato: false, cdl: 0 })]);
    expect(b.totali.teste).toBe(1);
  });

  it("ore STD: straordinari della domenica a STR65, accantonamenti SIC del mese", () => {
    const ago = leggiPresenzeGls(g, "2026-08");
    const o = oreGls(ago, "STD", festiviAnno(2026), TAR);
    expect(o.straordDom).toBe(3);
    expect(o.trasfGg).toBe(21);
    expect(festiviGls(festiviAnno(2026), "2026-11")).toEqual(["2026-11-01", "2026-11-30"]);
    const a = accantonamentiGls({ presenze: ago, cdl: CDL, par: PSIC, festivi: festiviAnno(2026) });
    expect(a.ferie).toBeCloseTo(500, 2);
  });
});

describe("Badgebox (dati inventati)", () => {
  const g = presenzeAgosto();
  const p = leggiPresenzeGls(g, "2026-08");
  const bbGrid = [
    sheet("Quantità verticali", [
      [null, "Presenze Agosto 2026"],
      [null, "Professional Solutions", null, null, null, null, null, "01", "02", "03", "04", "05"],
      [null, "Nome", "Cognome", "Codice", "Email", "Gruppo", "Valore"],
      [null, "UNO", "ROSSI", "AAAAAA00A00A000A", "x", "GLS - Castel Maggiore (BO)", "Ordinarie", 0, 0, 7.8, 0, 7.8],
      [null, "ALTRO", "AMAZON", "ZZZZZZ00Z00Z000Z", "x", "Amazon DER1", "Ordinarie", 8, 8, 8, 8, 8],
    ]),
    sheet("Timbrature verticali", [
      [null, "Presenze Agosto 2026"], [],
      [null, "Nome", "Cognome", "Codice", "Matricola", "D", "H", "V"],
      [null, "UNO", "ROSSI", "AAAAAA00A00A000A", "S1", "03/08/2026", "08:00", "E"],
      [null, "UNO", "ROSSI", "AAAAAA00A00A000A", "S1", "03/08/2026", "16:00", "U"],
      [null, "UNO", "ROSSI", "AAAAAA00A00A000A", "S1", "05/08/2026", "08:00", "E"],
    ]),
  ];
  it("tiene solo il gruppo GLS e trova le anomalie", () => {
    expect(isBadgebox(bbGrid)).toBe(true);
    const bb = leggiBadgebox(bbGrid, "2026-08");
    expect(bb.persone).toHaveLength(1);
    expect(bb.altriGruppi).toBe(1);
    const e = controlloBadgebox(p.griglia, p.anagrafica, bb);
    const uno = e.find((x) => x.cf === "AAAAAA00A00A000A")!;
    expect(uno.maiTimbra).toBe(false);
    expect(uno.giorniSenzaTimbratura).toContain("2026-08-04");
    expect(uno.timbratureDispari).toEqual(["2026-08-05"]);
    const r = riepilogoBadgebox(e);
    expect(r.maiTimbra).toBe(2); // il SIC cessato e lo STD lavorano senza mai timbrare
    expect(r.maiTimbraStd).toBe(1);
  });
});

describe("fogli F.O. GLS", () => {
  it("nomi dei fogli e riga per società", () => {
    expect(foglioFOGls("2026-09")).toBe("09_26 ");
    expect(foglioFOGls("2026-10")).toBe("10_26");
    expect(rigaNoleggioGls("ALD MT")).toBe(15);
    expect(rigaNoleggioGls("Ald")).toBe(16);
    expect(rigaNoleggioGls("Torental")).toBe(8);
    expect(rigaNoleggioGls("Noleggiare")).toBe(11);
  });
  it("10_26 richiama il 09_26 con lo spazio, _ft con teste e pedaggi di due mesi prima", () => {
    const wb = excelFOGls({ mese: "2026-10", carburante: 1000, elettrico: 1500, noleggi: [{ riga: 10, importo: 500, mezzi: 2, societa: ["Europcar"] }], danni: 4050, autostrade: 300, wind: 1000, elmec: 119.9, accStraord: 10, accFerie: 20, bustaSic: 360000, bustaNota: "", trasferta: 31000, costoStd: 20000, stdNota: "", teste: 108 });
    const fo = wb.getWorksheet("10_26")!, ft = wb.getWorksheet("1026_ft")!;
    expect((fo.getCell("P60").value as { formula: string }).formula).toBe("P58-'09_26 '!L60+'09_26 '!L61+K60-K61");
    expect((fo.getCell("P71").value as { formula: string }).formula).toBe("'1026_ft'!C17");
    expect(fo.getCell("D18").value).toBe(4050);
    expect((ft.getCell("C4").value as { formula: string }).formula).toBe("'09_26 '!P60+'09_26 '!P61");
    expect((ft.getCell("C7").value as { formula: string }).formula).toBe("'08_26 '!D53");
    expect((ft.getCell("C9").value as { formula: string }).formula).toBe("108*129.25");
  });
});

const K = (f: string) => esempio("gls", f);
const kitGls = hasKit && fs.existsSync(K("GLS_Castel_Maggiore_Presenze_OTTOBRE_2026.xlsx")) && fs.existsSync(K("DB_CDL_base_0926_AmazonGLS_BO.xlsx"));

describe.skipIf(!kitGls)("GLS ottobre 2026 (kit locale, golden)", () => {
  it("presenze di ottobre: totali della griglia e teste attive", async () => {
    const p = leggiPresenzeGls(await grids(K("GLS_Castel_Maggiore_Presenze_OTTOBRE_2026.xlsx")), "2026-10");
    const t = totaliGriglia(p.griglia);
    expect(p.griglia).toHaveLength(108); // 2 righe senza nessun valore nel mese
    expect(p.griglia.filter((x) => Object.values(x.voci).some((m) => Object.keys(m ?? {}).length))).toHaveLength(106);
    expect(t.Ordinarie).toBeCloseTo(12868.8, 1);
    expect(t.Straordinari).toBeCloseTo(188.5, 1);
    expect(t.MALATTIA).toBeCloseTo(1927.4, 1);
    expect(t.ROL).toBeCloseTo(307.5, 1);
    expect(p.anagrafica.filter((a) => a.attivo && a.tipo === "SIC")).toHaveLength(96);
    expect(p.anagrafica.filter((a) => a.attivo && a.tipo === "STD")).toHaveLength(12);
  });

  it("Badgebox di ottobre: 13 mai timbrato (10 STD, 3 SIC), 58 giorni senza timbratura", async () => {
    const p = leggiPresenzeGls(await grids(K("GLS_Castel_Maggiore_Presenze_OTTOBRE_2026.xlsx")), "2026-10");
    const bb = leggiBadgebox(await grids(K("10_26_Badgebox_GLS.xlsx")), "2026-10");
    const e = controlloBadgebox(p.griglia, p.anagrafica, bb);
    const r = riepilogoBadgebox(e);
    expect([r.maiTimbra, r.maiTimbraStd, r.maiTimbraSic, r.giorniSenzaTimbratura]).toEqual([13, 10, 3, 58]);
    expect(Math.max(...e.map((x) => x.giorniSenzaTimbratura.length))).toBe(16);
  });

  it.skipIf(!fs.existsSync(K("GLS_Castel_Maggiore_Presenze_AGOSTO_2026.xlsx")))("busta di settembre dalle presenze di agosto ≈ payroll 09/2026 CDC 5565 (±3 %; con trasferta GLS 25 € è +2,2 %)", async () => {
    const cdl = leggiAnagraficaCDL(await grids(K("DB_CDL_base_0926_AmazonGLS_BO.xlsx")), "SIC GLS BO").righe;
    const ago = leggiPresenzeGls(await grids(K("GLS_Castel_Maggiore_Presenze_AGOSTO_2026.xlsx")), "2026-08");
    const set = leggiPresenzeGls(await grids(K("GLS_Castel_Maggiore_Presenze_SETTEMBRE_2026.xlsx")), "2026-09");
    const b = bustaGls({ mese: "2026-09", variabili: ago, anagMese: set.anagrafica, cdl, par: PSIC, tariffe: TAR, festivi: festiviAnno(2026) });
    const pay = leggiPayroll(await grids(K("payroll/Costi_del_Personale_PS_0926_AMAZONGLS.xlsx")), 5565);
    const reale = totalePayroll(pay.righe);
    expect(reale).toBeCloseTo(291632.97, 2);
    expect(Math.abs(b.totali.totale / reale - 1)).toBeLessThan(0.03);
    expect(b.totali.trasferta).toBe(802 * 25); // payroll: 20.925 €
  }, 60_000);
});
