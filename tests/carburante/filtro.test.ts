import { describe, expect, it } from "vitest";
import { conFlotta, diTarga, filtraRighe, filtroDaIndirizzo, isMeseValido, leggiFiltro, queryFiltro, quanteArchiviate, riepilogoScope, targhePresenti, type FiltroCarburante } from "@/lib/carburante/filtro";
import { COLONNE_EXPORT, csvRighe, nomeFileExport, sembraFormula, testoSicuro } from "@/lib/carburante/esporta";
import { excelRiconciliazione } from "@/lib/carburante/excel";
import type { Riga, Stato } from "@/domain/carburante/riconciliazione";
import type { RigaPagina } from "@/lib/carburante/riconciliazione";

// righe finte: targhe, carte e luoghi inventati
let n = 0;
function riga(stato: Stato, x: Partial<RigaPagina> = {}): RigaPagina {
  n++;
  const base: Riga = {
    chiave: `Q8:prova${n}`, stato, flotta: "DER2", giorno: "2026-10-07", q8: [], eventi: [], targa: "AA000AA",
    oraQ8: "08:10", oraTarga: "08:12", litriQ8: 50, litriTarga: 50, deltaLitri: 0, euro: null, luogoQ8: "Via Prova 1, Paese", luogoTarga: "Via Prova, Paese",
    luogo: "UGUALE", distanzaKm: null, motivo: "Pagamento e rifornimento coincidono.", abituale: null,
  };
  return { ...base, archiviata: null, ...x };
}
const q8 = (identificativo: string) => ({ chiave: `k${identificativo}`, flotta: "DER2" as const, giorno: "2026-10-07", ora: "08:10:00", identificativo, litri: 50, importoNoIva: 80, prodotto: "GASOLIO", impianto: "9999", indirizzo: "Via Prova 1", citta: "Paese", km: null });

const tutto: Omit<FiltroCarburante, "mese"> = { flotta: "TUTTE", targa: null, regolari: true, nonVerificabili: true, archiviate: true };
const normale: Omit<FiltroCarburante, "mese"> = { flotta: "TUTTE", targa: null, regolari: false, nonVerificabili: false, archiviate: false };

const RIGHE = [
  riga("SERBATOIO_FERMO", { deltaLitri: -40, euro: 64, litriTarga: null, q8: [q8("AMZ001")] }),
  riga("LITRI", { targa: "BB111BB", deltaLitri: -12.5, euro: 20, q8: [q8("AMZ002")] }),
  riga("LUOGO", { flotta: "GLS", targa: "CC222CC", q8: [q8("GLS001")] }),
  riga("SENZA_Q8", { targa: "BB111BB", litriQ8: null, deltaLitri: null }),
  riga("REGOLARE", { q8: [q8("AMZ001")] }),
  riga("NON_VERIFICABILE", { targa: null, abituale: { targa: "DD333DD", volte: 5, su: 6 }, q8: [q8("AMZ003")], motivo: "Solo 5 L: il sensore del serbatoio può non accorgersene." }),
  riga("LITRI", { targa: "BB111BB", deltaLitri: -8, euro: 13, q8: [q8("AMZ002")], archiviata: { motivo: "Sensore guasto", nota: null, da: "Utente Prova", il: "2026-11-02T09:00:00.000Z", stato: "LITRI" } }),
];

describe("filtri dall'indirizzo", () => {
  it("legge i parametri e mette i valori normali a quelli mancanti o sbagliati", () => {
    expect(leggiFiltro(new URLSearchParams("mese=2026-10&flotta=der2&targa=bb 111-bb&regolari=1&nonverificabili=1&archiviate=1"), "2026-09"))
      .toEqual({ mese: "2026-10", flotta: "DER2", targa: "BB111BB", regolari: true, nonVerificabili: true, archiviate: true });
    expect(leggiFiltro({ mese: "2026-13", flotta: "XYZ", regolari: "0" }, "2026-09"))
      .toEqual({ mese: "2026-09", flotta: "TUTTE", targa: null, regolari: false, nonVerificabili: false, archiviate: false });
    expect(leggiFiltro({ mese: ["2026-08", "2026-07"], flotta: "GLS" }, "2026-09")).toMatchObject({ mese: "2026-08", flotta: "GLS" });
  });
  it("mese valido solo AAAA-MM", () => {
    expect(isMeseValido("2026-10")).toBe(true);
    for (const m of ["2026-00", "2026-13", "26-10", "2026-1", "", null, undefined]) expect(isMeseValido(m)).toBe(false);
  });
  it("andata e ritorno: queryFiltro scrive solo quello che serve e leggiFiltro lo rilegge uguale", () => {
    const f: FiltroCarburante = { mese: "2026-10", flotta: "GLS", targa: "CC222CC", regolari: false, nonVerificabili: true, archiviate: true };
    const q = queryFiltro(f, { formato: "csv" });
    expect(q).toBe("mese=2026-10&flotta=GLS&targa=CC222CC&nonverificabili=1&archiviate=1&formato=csv");
    expect(leggiFiltro(new URLSearchParams(q), "2000-01")).toEqual(f);
    expect(queryFiltro({ mese: "2026-10", flotta: "TUTTE", targa: null, regolari: false, nonVerificabili: false, archiviate: false })).toBe("mese=2026-10");
  });
  it("la pagina legge i filtri solo dall'indirizzo: dopo «Indietro» filtri e indirizzo coincidono", () => {
    // l'utente cambia i filtri: la pagina scrive l'indirizzo con replaceState…
    const scelto: FiltroCarburante = { mese: "2026-10", flotta: "DER2", targa: "BB111BB", regolari: true, nonVerificabili: false, archiviate: true };
    const indirizzo = `/telematica/carburante?${queryFiltro(scelto)}`;
    // …e torna indietro dalla Giornata: i filtri si rileggono dallo stesso indirizzo, non da uno stato a parte
    expect(filtroDaIndirizzo(new URL(indirizzo, "http://x").searchParams, "2026-10")).toEqual(scelto);
    // il mese è sempre quello caricato dal server, anche se l'indirizzo non lo ha o lo ha sbagliato
    expect(filtroDaIndirizzo(new URLSearchParams("flotta=gls&nonverificabili=1"), "2026-09")).toEqual({ mese: "2026-09", flotta: "GLS", targa: null, regolari: false, nonVerificabili: true, archiviate: false });
    expect(filtroDaIndirizzo(new URLSearchParams("mese=2026-08&targa=cc222cc"), "2026-09")).toMatchObject({ mese: "2026-09", targa: "CC222CC" });
  });
  it("cambiando flotta la targa resta solo se ha righe anche nella nuova flotta", () => {
    const f: FiltroCarburante = { mese: "2026-10", flotta: "TUTTE", targa: "BB111BB", regolari: false, nonVerificabili: false, archiviate: false };
    expect(conFlotta(f, "DER2", RIGHE)).toMatchObject({ flotta: "DER2", targa: "BB111BB" });
    expect(conFlotta(f, "GLS", RIGHE)).toMatchObject({ flotta: "GLS", targa: null });
  });
});

describe("righe da mostrare", () => {
  it("di solito: nascosti regolari, non verificabili e archiviate; l'ordine resta quello del motore", () => {
    expect(filtraRighe(RIGHE, normale).map((r) => r.stato)).toEqual(["SERBATOIO_FERMO", "LITRI", "LUOGO", "SENZA_Q8"]);
    expect(filtraRighe(RIGHE, tutto)).toHaveLength(RIGHE.length);
  });
  it("ogni interruttore aggiunge solo il suo tipo", () => {
    expect(filtraRighe(RIGHE, { ...normale, regolari: true }).map((r) => r.stato)).toContain("REGOLARE");
    expect(filtraRighe(RIGHE, { ...normale, regolari: true }).map((r) => r.stato)).not.toContain("NON_VERIFICABILE");
    expect(filtraRighe(RIGHE, { ...normale, nonVerificabili: true }).map((r) => r.stato)).toContain("NON_VERIFICABILE");
    const conArch = filtraRighe(RIGHE, { ...normale, archiviate: true });
    expect(conArch.filter((r) => r.archiviata)).toHaveLength(1);
    expect(conArch).toHaveLength(5);
  });
  it("flotta e targa; per un pagamento senza furgone vale il furgone abituale della carta", () => {
    expect(filtraRighe(RIGHE, { ...tutto, flotta: "GLS" }).map((r) => r.targa)).toEqual(["CC222CC"]);
    expect(filtraRighe(RIGHE, { ...normale, targa: "BB111BB" }).map((r) => r.stato)).toEqual(["LITRI", "SENZA_Q8"]);
    expect(filtraRighe(RIGHE, { ...tutto, targa: "dd 333 dd" }).map((r) => r.stato)).toEqual(["NON_VERIFICABILE"]);
    expect(filtraRighe(RIGHE, { ...tutto, flotta: "GLS", targa: "BB111BB" })).toEqual([]);
    expect(diTarga({ targa: "AA000AA", abituale: { targa: "DD333DD", volte: 3, su: 3 } }, "DD333DD")).toBe(false);
  });
  it("elenco delle targhe della flotta scelta", () => {
    expect(targhePresenti(RIGHE, "TUTTE")).toEqual(["AA000AA", "BB111BB", "CC222CC", "DD333DD"]);
    expect(targhePresenti(RIGHE, "GLS")).toEqual(["CC222CC"]);
  });
});

describe("schede", () => {
  it("le archiviate non contano tra anomalie, litri ed euro, ma i loro pagamenti sì tra quelli analizzati", () => {
    const r = riepilogoScope(RIGHE, { flotta: "DER2", targa: null });
    expect(r.pagamentiQ8).toBe(5);
    expect(r.anomalie).toBe(3);
    expect(r.perStato).toMatchObject({ SERBATOIO_FERMO: 1, LITRI: 1, SENZA_Q8: 1, REGOLARE: 1, NON_VERIFICABILE: 1, LUOGO: 0 });
    expect(r.litriMancanti).toBe(52.5);
    expect(r.euroMancanti).toBe(84);
    expect(riepilogoScope(RIGHE, { flotta: "TUTTE", targa: "BB111BB" })).toMatchObject({ pagamentiQ8: 2, anomalie: 2, litriMancanti: 12.5, euroMancanti: 20 });
    expect(quanteArchiviate(RIGHE, { flotta: "TUTTE", targa: null })).toBe(1);
    expect(quanteArchiviate(RIGHE, { flotta: "GLS", targa: null })).toBe(0);
  });
});

describe("export", () => {
  it("CSV con BOM, punto e virgola, numeri con la virgola e testo tra virgolette quando serve", () => {
    const csv = csvRighe([riga("LITRI", { deltaLitri: -12.5, euro: 20.456, litriQ8: 62.53, motivo: 'Pagati 62,5 L; detto "strano"', q8: [q8("AMZ002")], abituale: { targa: "BB111BB", volte: 4, su: 5 } })]);
    expect(csv.startsWith("﻿Giorno;Ora Q8;")).toBe(true);
    const [testa, prima] = csv.slice(1).trim().split("\r\n");
    expect(testa.split(";")).toHaveLength(COLONNE_EXPORT.length);
    expect(prima).toContain("07/10/2026;08:10;08:12;DER2;AA000AA;Discrepanza litri;62,5;50;-12,5;20,46;");
    expect(prima).toContain('"Pagati 62,5 L; detto ""strano"""');
    expect(prima).toContain(";AMZ002;9999;BB111BB (4 su 5);");
  });
  it("Excel: intestazione in grassetto e bloccata, filtro automatico, giorno come data, formati di litri ed euro", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const buf = await excelRiconciliazione(filtraRighe(RIGHE, normale), RIGHE, { mese: "2026-10", ...normale });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet("Incrocio Q8 Targa")!;
    expect(ws.rowCount).toBe(5);
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
    const col = (nome: string) => COLONNE_EXPORT.findIndex((c) => c.nome === nome) + 1;
    const riga2 = ws.getRow(2);
    expect((riga2.getCell(col("Giorno")).value as Date).toISOString().slice(0, 10)).toBe("2026-10-07");
    expect(riga2.getCell(col("Tipo")).value).toBe("Carta usata, serbatoio fermo");
    expect(riga2.getCell(col("Delta litri (Targa − Q8)")).numFmt).toBe("0.0");
    expect(riga2.getCell(col("Valore stimato € (IVA esclusa)")).value).toBe(64);
    expect(riga2.getCell(col("Valore stimato € (IVA esclusa)")).numFmt).toBe("#,##0.00");
    // senza targa: tutte le flotte insieme e ogni flotta, come le schede (archiviate contate solo tra le transazioni)
    const rie = wb.getWorksheet("Riepilogo")!;
    expect(rie.getRow(1).values).toEqual([undefined, "Voce", "Tutte le flotte", "DER2", "GLS"]);
    expect(rie.getRow(2).values).toEqual([undefined, "Transazioni Q8 analizzate", 6, 5, 1]);
    expect(rie.getRow(3).values).toEqual([undefined, "Anomalie", 4, 3, 1]);
  });
  it("Excel con la targa: il riepilogo è quello delle schede per quel furgone e dice di cosa sono i totali", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const f: FiltroCarburante = { mese: "2026-10", ...normale, targa: "BB111BB" };
    const buf = await excelRiconciliazione(filtraRighe(RIGHE, f), RIGHE, f);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const rie = wb.getWorksheet("Riepilogo")!;
    const voce = (nome: string): unknown[] | undefined => { const trovate: unknown[][] = []; rie.eachRow((r) => { if (r.getCell(1).value === nome) trovate.push((r.values as unknown[]).slice(2)); }); return trovate[0]; };
    const schede = riepilogoScope(RIGHE, f);
    expect(rie.getRow(1).values).toEqual([undefined, "Voce", "Tutte le flotte · BB111BB"]);
    expect(voce("Transazioni Q8 analizzate")).toEqual([schede.pagamentiQ8]);
    expect(voce("Anomalie")).toEqual([schede.anomalie]);
    expect(voce("Litri non giustificati")).toEqual([12.5]);
    expect(voce("Valore stimato dell'ammanco € (IVA esclusa)")).toEqual([20]);
    expect(schede).toMatchObject({ pagamentiQ8: 2, anomalie: 2 });
    expect(String(voce("Di cosa sono i totali")?.[0])).toContain("solo le righe del furgone BB111BB");
    expect(voce("Righe nel primo foglio")).toEqual([2]);
  });
  it("CSV: un testo che sembra una formula (anche dopo spazi o tab) prende un apostrofo; i numeri negativi no", () => {
    expect(["=1+1", "+39 333", "-x", "@SOMMA(A1)", "  =A1", "\t+A1"].map(sembraFormula)).toEqual([true, true, true, true, true, true]);
    expect(["Via Emilia 12", "A=1", "", "12-3"].map(sembraFormula)).toEqual([false, false, false, false]);
    expect(testoSicuro(" \t=A1")).toBe("' \t=A1");
    const csv = csvRighe([riga("LITRI", { deltaLitri: -12.5, euro: 20, motivo: '=HYPERLINK("http://esempio.invalid";"clic")', luogoQ8: "+39 Via Prova", luogoTarga: "\t-1, Paese", q8: [q8("@AMZ9")] })]);
    const [, prima] = csv.slice(1).trim().split("\r\n");
    expect(prima).toContain(";-12,5;20,00;");
    expect(prima).toContain(`;'+39 Via Prova;'\t-1, Paese;`);
    expect(prima).toContain(`"'=HYPERLINK(""http://esempio.invalid"";""clic"")"`);
    expect(prima).toContain(";'@AMZ9;");
  });
  it("Excel: i testi che sembrano formule restano testo (non formule)", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const r = riga("LITRI", { deltaLitri: -12.5, motivo: "=1+1", luogoQ8: " -2" });
    const buf = await excelRiconciliazione([r], [r], { mese: "2026-10", ...tutto });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet("Incrocio Q8 Targa")!;
    const col = (nome: string) => COLONNE_EXPORT.findIndex((c) => c.nome === nome) + 1;
    const motivo = ws.getRow(2).getCell(col("Motivo")), luogo = ws.getRow(2).getCell(col("Luogo Q8")), delta = ws.getRow(2).getCell(col("Delta litri (Targa − Q8)"));
    expect(motivo.type).toBe(ExcelJS.ValueType.String);
    expect(motivo.value).toBe("=1+1");
    expect(motivo.formula).toBeUndefined();
    expect(motivo.numFmt).toBe("@");
    expect(luogo.type).toBe(ExcelJS.ValueType.String);
    expect(luogo.numFmt).toBe("@");
    expect(delta.value).toBe(-12.5);
    expect(delta.numFmt).toBe("0.0");
  });
  it("nome del file con il mese", () => {
    expect(nomeFileExport("2026-10", "xlsx")).toBe("Carburante_Q8_Targa_2026-10.xlsx");
    expect(nomeFileExport("2026-10", "csv")).toBe("Carburante_Q8_Targa_2026-10.csv");
  });
});
