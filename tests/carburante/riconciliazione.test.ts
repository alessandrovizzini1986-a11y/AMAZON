import { describe, expect, it } from "vitest";
import {
  abbina, comuneQ8, km, minuti, riconcilia, riepiloga, stessoComune, tappeNecessarie, tolleranzaLitri, ungherese,
  type Copertura, type EventoTarga, type GiornataTappe, type Ingresso, type Q8Tx,
} from "@/domain/carburante/riconciliazione";

const G = "2026-09-10";
let n = 0;
const q8 = (ora: string, litri: number, x: Partial<Q8Tx> = {}): Q8Tx => ({
  chiave: `k${++n}`, flotta: "DER2", giorno: G, ora, identificativo: "AMZ001", litri, importoNoIva: Math.round(litri * 1.7 * 100) / 100,
  prodotto: "GASOLIO", impianto: "1001", indirizzo: "SS. 9 EMILIA KM.8+702", citta: "SANTARCANGELO DI ROMAGNA", km: null, ...x,
});
const ev = (ora: string, litri: number, x: Partial<EventoTarga> = {}): EventoTarga => ({
  targa: "AA000AA", flotta: "DER2", giorno: G, ora, litri, dove: "Via Emilia, Santarcangelo Di Romagna, Rn, Emilia-romagna, Italia", ...x,
});
const coperto = (giorni: string[], flotta: "DER2" | "GLS" = "DER2"): Copertura[] => giorni.map((giorno) => ({ flotta, giorno, scaricato: true, dettaglioCompleto: true }));
const ingresso = (q: Q8Tx[], e: EventoTarga[], x: Partial<Ingresso> = {}): Ingresso => ({
  q8: q, eventi: e, tappe: [], copertura: coperto([...new Set([...q.map((a) => a.giorno), ...e.map((a) => a.giorno)])]),
  ultimoGiornoQ8: { DER2: "2026-09-30", GLS: "2026-09-30" }, ...x,
});

describe("strumenti", () => {
  it("algoritmo ungherese: trova il costo minimo come la ricerca esaustiva", () => {
    const perm = (k: number): number[][] => (k === 1 ? [[0]] : perm(k - 1).flatMap((p) => Array.from({ length: k }, (_, i) => [...p.slice(0, i), k - 1, ...p.slice(i)])));
    for (const c of [[[4, 1, 3], [2, 0, 5], [3, 2, 2]], [[9, 2, 7, 8], [6, 4, 3, 7], [5, 8, 1, 8], [7, 6, 9, 4]], [[1, 1e6], [1e6, 1]]]) {
      const ass = ungherese(c), tot = ass.reduce((s, j, i) => s + c[i][j], 0);
      const min = Math.min(...perm(c.length).map((p) => p.reduce((s, j, i) => s + c[i][j], 0)));
      expect(tot).toBe(min);
      expect(new Set(ass).size).toBe(c.length);
    }
  });
  it("minuti assoluti: la mezzanotte resta vicina", () => {
    expect(minuti("2026-09-11", "00:10")! - minuti("2026-09-10", "23:50")!).toBe(20);
    expect(minuti("2026-09-10", "10:00:30")! - minuti("2026-09-10", "10:00")!).toBe(0.5);
    expect(minuti("2026-09-10", "")).toBeNull();
  });
  it("comuni: località, S. per San, apostrofi e indirizzi di Targa troncati", () => {
    expect(comuneQ8("CESENATICO LOC.BAGNAROLA")).toBe("CESENATICO");
    expect(comuneQ8("S. GIOVANNI IN MARIGNANO")).toBe("SAN GIOVANNI IN MARIGNANO");
    expect(comuneQ8("FORLI'")).toBe("FORLI");
    expect(comuneQ8("CERVIA - FRAZ. TAGLIATA")).toBe("CERVIA");
    expect(stessoComune("FORLI'", "Viale Roma, Forlì, Fc, Emilia-romagna, Italia")).toBe(true);
    expect(stessoComune("S. GIOVANNI IN MARIGNANO", "Strada Provinciale Saludecese Variante Pianventena, San Gio…")).toBe(true);
    expect(stessoComune("RIMINI", "Rimini, Rn, Emilia-romagna, Italia")).toBe(true);
    expect(stessoComune("RICCIONE", "Strada Statale 16 Adriatica, Bellaria-igea Marina, Rn")).toBe(false);
    expect(tolleranzaLitri(40)).toBe(3);
    expect(tolleranzaLitri(100)).toBe(5);
    expect(Math.round(km({ lat: 44.0, lng: 12.0 }, { lat: 44.01, lng: 12.0 }) * 100) / 100).toBe(1.11);
  });
});

describe("riconciliazione Q8 – Targa", () => {
  it("due furgoni alla stessa pompa negli stessi minuti: abbina per litri, non per il più vicino nel tempo", () => {
    const a = q8("07:40", 40, { identificativo: "AMZ001" }), b = q8("07:45", 70, { identificativo: "AMZ002" });
    const x = ev("07:44", 40, { targa: "XX111XX" }), y = ev("07:41", 70, { targa: "YY222YY" });
    const r = riconcilia(ingresso([a, b], [x, y])).righe;
    expect(r.map((z) => [z.q8[0]?.chiave, z.targa, z.stato])).toEqual(expect.arrayContaining([[a.chiave, "XX111XX", "REGOLARE"], [b.chiave, "YY222YY", "REGOLARE"]]));
  });
  it("discrepanza litri: pagati 70, entrati 50 → delta −20 L e valore al prezzo pagato", () => {
    const q = q8("10:00", 70, { importoNoIva: 119 });
    const [r] = riconcilia(ingresso([q], [ev("10:03", 50)])).righe;
    expect(r).toMatchObject({ stato: "LITRI", deltaLitri: -20, euro: 34, litriQ8: 70, litriTarga: 50 });
  });
  it("tolleranza: ±3 L o ±5 %, la più larga", () => {
    expect(riconcilia(ingresso([q8("10:00", 40)], [ev("10:02", 37.2)])).righe[0].stato).toBe("REGOLARE");
    expect(riconcilia(ingresso([q8("10:00", 40)], [ev("10:02", 36.5)])).righe[0].stato).toBe("LITRI");
    expect(riconcilia(ingresso([q8("10:00", 100)], [ev("10:02", 95.5)])).righe[0].stato).toBe("REGOLARE");
    // più gasolio entrato che pagato non è un ammanco
    const [r] = riconcilia(ingresso([q8("10:00", 30)], [ev("10:02", 45)])).righe;
    expect(r.stato).toBe("REGOLARE");
    expect(r.euro).toBeNull();
    expect(r.motivo).toContain("in più");
  });
  it("scontrino doppio: due pagamenti della stessa carta per un solo pieno", () => {
    const a = q8("10:00", 20), b = q8("10:04", 30);
    const r = riconcilia(ingresso([a, b], [ev("10:06", 50)])).righe;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ stato: "REGOLARE", litriQ8: 50 });
    expect(r[0].q8).toHaveLength(2);
    expect(r[0].motivo).toContain("Scontrini: 2");
  });
  it("rifornimento letto in due parti dal sensore", () => {
    const r = riconcilia(ingresso([q8("10:00", 50)], [ev("10:02", 30), ev("10:20", 20)])).righe;
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ stato: "REGOLARE", litriTarga: 50 });
    expect(r[0].eventi).toHaveLength(2);
  });
  it("luogo diverso: stessa ora e litri ma il furgone è in un altro comune", () => {
    const fuori = { dove: "Via Carso, 13, Gambettola, Fc, Emilia-romagna, Italia" };
    expect(riconcilia(ingresso([q8("17:00", 40)], [ev("17:04", 40, fuori)])).righe[0].stato).toBe("LUOGO");
    // troppo lontani nel tempo per essere lo stesso rifornimento: restano separati
    const r = riconcilia(ingresso([q8("17:00", 40)], [ev("17:25", 40, fuori)])).righe;
    expect(r.map((x) => x.stato).sort()).toEqual(["NON_VERIFICABILE", "SENZA_Q8"]);
  });
  it("luogo con le coordinate: il distributore si impara dai rifornimenti sicuri, poi conta la distanza", () => {
    const vicino = { lat: 44.06, lng: 12.45 };
    const sicuri = ["08:00", "09:00", "10:00"].map((o, i) => [q8(o, 40 + i, { identificativo: `AMZ10${i}` }), ev(o, 40 + i, { ...vicino, targa: `T${i}` })] as const);
    const lontano = ev("15:02", 45, { lat: 44.2, lng: 12.45, targa: "T9", dove: "Via Emilia, Santarcangelo Di Romagna, Rn" });
    const r = riconcilia(ingresso([...sicuri.map((s) => s[0]), q8("15:00", 45, { identificativo: "AMZ199" })], [...sicuri.map((s) => s[1]), lontano])).righe;
    const z = r.find((x) => x.targa === "T9")!;
    expect(z.stato).toBe("LUOGO");
    expect(z.distanzaKm).toBeGreaterThan(10);
    expect(r.filter((x) => x.stato === "REGOLARE")).toHaveLength(3);
  });
  it("rifornimento senza pagamento Q8, e prima del caricamento del file Q8", () => {
    expect(riconcilia(ingresso([], [ev("10:00", 40)])).righe[0].stato).toBe("SENZA_Q8");
    const r = riconcilia(ingresso([], [ev("10:00", 40)], { ultimoGiornoQ8: { DER2: "2026-09-05" } })).righe[0];
    expect(r.stato).toBe("NON_VERIFICABILE");
    expect(r.motivo).toContain("05/09");
    expect(riconcilia(ingresso([], [ev("10:00", 40)], { ultimoGiornoQ8: { DER2: null } })).righe[0].stato).toBe("NON_VERIFICABILE");
  });
  it("non verificabili: GLS senza sensore, AdBlue, giorno non scaricato, dettaglio mancante, pochi litri, furgone senza telematica", () => {
    const motivi = (q: Q8Tx, x: Partial<Ingresso> = {}) => riconcilia(ingresso([q], [], x)).righe[0];
    expect(motivi(q8("10:00", 40, { flotta: "GLS" }), { copertura: coperto([G], "GLS") })).toMatchObject({ stato: "NON_VERIFICABILE" });
    expect(motivi(q8("10:00", 40, { flotta: "GLS" })).motivo).toContain("GLS");
    expect(motivi(q8("10:00", 10, { prodotto: "AD BLUE" })).motivo).toContain("serbatoio");
    expect(motivi(q8("10:00", 40), { copertura: [] }).motivo).toContain("non è ancora scaricata");
    expect(motivi(q8("10:00", 40), { copertura: [{ flotta: "DER2", giorno: G, scaricato: true, dettaglioCompleto: false }] }).motivo).toContain("Mancano ora e luogo");
    expect(motivi(q8("10:00", 5)).motivo).toContain("sensore");
    expect(motivi(q8("10:00", 40)).motivo).toContain("senza telematica");
    // un rifornimento di cui Targa non ha dato l'ora non si può abbinare
    expect(riconcilia(ingresso([], [ev("", 40)])).righe[0]).toMatchObject({ stato: "NON_VERIFICABILE", motivo: expect.stringContaining("Manca l'ora") });
  });
  it("carta usata, serbatoio fermo: il furgone abituale della carta passa dal distributore ma non registra gasolio", () => {
    const storia = ["2026-09-01", "2026-09-03", "2026-09-05"].flatMap((g) => [q8("09:00", 40, { giorno: g, identificativo: "AMZ050" }), ev("09:02", 40, { giorno: g, targa: "HB123CD" })]);
    const sospetto = q8("17:30", 45, { identificativo: "AMZ050", importoNoIva: 80 });
    const q = [...storia.filter((x): x is Q8Tx => "chiave" in x), sospetto], e = storia.filter((x): x is EventoTarga => !("chiave" in x));
    const pre = abbina(q, e);
    expect(tappeNecessarie(pre)).toEqual([{ targa: "HB123CD", giorno: G }]);
    const tappe: GiornataTappe[] = [{ targa: "HB123CD", giorno: G, tappe: [
      { t: "G", da: "16:50", a: "17:25", dove: "Via Emilia, Santarcangelo Di Romagna, Rn, Emilia-romagna, Italia" },
      { t: "S", da: "17:25", a: "17:40", dove: "Via Emilia, Santarcangelo Di Romagna, Rn, Emilia-romagna, Italia" },
    ] }];
    const cop = coperto(["2026-09-01", "2026-09-03", "2026-09-05", G]);
    const r = riconcilia({ ...ingresso(q, e), tappe, copertura: cop }, pre).righe.find((x) => x.q8[0]?.chiave === sospetto.chiave)!;
    expect(r).toMatchObject({ stato: "SERBATOIO_FERMO", targa: "HB123CD", deltaLitri: -45, euro: 80 });
    expect(r.motivo).toContain("HB123CD");
    // se il furgone abituale quel momento era altrove, non è un'accusa: resta non verificabile
    const altrove: GiornataTappe[] = [{ targa: "HB123CD", giorno: G, tappe: [{ t: "S", da: "16:00", a: "18:00", dove: "Via Roma, Rimini, Rn" }] }];
    expect(riconcilia({ ...ingresso(q, e), tappe: altrove, copertura: cop }).righe.find((x) => x.q8[0]?.chiave === sospetto.chiave)!.stato).toBe("NON_VERIFICABILE");
  });
  it("una sosta lunga vicino alla pompa (parcheggio) non conta come passaggio dal distributore", () => {
    const storia = ["2026-09-01", "2026-09-03", "2026-09-05"].flatMap((g) => [q8("09:00", 40, { giorno: g, identificativo: "AMZ060" }), ev("09:02", 40, { giorno: g, targa: "HB999CD" })]);
    const q = [...storia.filter((x): x is Q8Tx => "chiave" in x), q8("17:30", 45, { identificativo: "AMZ060" })], e = storia.filter((x): x is EventoTarga => !("chiave" in x));
    const tappe: GiornataTappe[] = [{ targa: "HB999CD", giorno: G, tappe: [{ t: "S", da: "00:00", a: "23:59", dove: "Via Emilia, Santarcangelo Di Romagna, Rn" }] }];
    const r = riconcilia({ ...ingresso(q, e), tappe, copertura: coperto(["2026-09-01", "2026-09-03", "2026-09-05", G]) }).righe;
    expect(r.some((x) => x.stato === "SERBATOIO_FERMO")).toBe(false);
  });
  it("Targa registra il rifornimento in ritardo: stesso furgone abituale e stessi litri, fino a 2 ore dopo", () => {
    const storia = ["2026-09-01", "2026-09-03", "2026-09-05"].flatMap((g) => [q8("09:00", 40, { giorno: g, identificativo: "AMZ070" }), ev("09:02", 40, { giorno: g, targa: "HC111DD" })]);
    const q = [...storia.filter((x): x is Q8Tx => "chiave" in x), q8("13:43", 38.1, { identificativo: "AMZ070", indirizzo: "PONTE ABBADESSE 110", citta: "CESENA", impianto: "2002" })];
    const e = [...storia.filter((x): x is EventoTarga => !("chiave" in x)), ev("14:30", 38.7, { targa: "HC111DD", dove: "Via Giovanni Pacchioni, 325, Cesena, Fc" })];
    const r = riconcilia({ ...ingresso(q, e), copertura: coperto(["2026-09-01", "2026-09-03", "2026-09-05", G]) }).righe.find((x) => x.giorno === G)!;
    expect(r).toMatchObject({ stato: "REGOLARE", targa: "HC111DD" });
    expect(r.motivo).toContain("47 minuti dopo");
  });
  it("riepilogo: anomalie, litri ed euro mancanti", () => {
    const righe = riconcilia(ingresso([q8("10:00", 70, { importoNoIva: 119 }), q8("12:00", 40)], [ev("10:02", 50), ev("12:01", 40), ev("15:00", 30, { targa: "ZZ" })])).righe;
    const r = riepiloga(righe);
    expect(r).toMatchObject({ pagamentiQ8: 2, anomalie: 2, litriMancanti: 20, euroMancanti: 34 });
    expect(r.perStato).toMatchObject({ LITRI: 1, REGOLARE: 1, SENZA_Q8: 1 });
  });
});
