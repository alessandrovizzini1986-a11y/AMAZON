import ExcelJS from "exceljs";
import type { EsitoTelepass } from "@/domain/telepass/telepass";
import { DS, weeknumExcel } from "@/domain/telepass/comune";
import { L } from "@/lib/presenze/excelFineMese";

const f = (formula: string, result?: number | string) => ({ formula, result }) as ExcelJS.CellFormulaValue;
const bold = { bold: true };

const LARGHEZZE: Record<string, number> = { A: 16.3, B: 15, C: 48.9, D: 24.6, E: 9.3, F: 10.4, H: 10.3, I: 20.1, J: 22, K: 26.6, L: 9.7, M: 13.9, N: 16, P: 16, T: 10, X: 28, Y: 28 };

/**
 * MM_Telepass_<Mese>_<AAAA>.xlsx come l'atteso: tabella Toll (STATION valore,
 * WEEK formula), PVT a formule SUMIFS, ztlrimini e RMPP vuoti, Anomalie.
 * Le formule portano già il risultato calcolato, così il file si legge anche
 * prima del ricalcolo.
 */
export function excelTelepass(e: EsitoTelepass): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FleetDSP";
  const ws = wb.addWorksheet(e.foglio);
  const nc = e.intestazione.length;
  const week = (d: unknown) => (d instanceof Date ? weeknumExcel(d) : undefined);
  ws.addTable({
    name: "Toll",
    ref: "A1",
    headerRow: true,
    style: { theme: "TableStyleMedium2", showRowStripes: true, showColumnStripes: false, showFirstColumn: false, showLastColumn: false },
    columns: e.intestazione.map((name) => ({ name, filterButton: true })),
    rows: (e.righe.length ? e.righe : [Array(nc - 1).fill(null)]).map((r) => [...Array.from({ length: nc - 1 }, (_, j) => r[j] ?? null), f("WEEKNUM(Toll[[#This Row],[Data]])", week(r[e.iData]))]),
  });
  for (let r = 2; r <= e.righe.length + 1; r++) {
    ws.getCell(r, e.iData + 1).numFmt = "mm-dd-yy";
    ws.getCell(r, e.iOra + 1).numFmt = "h:mm:ss";
  }
  for (const [c, w] of Object.entries(LARGHEZZE)) ws.getColumn(c).width = w;

  // PVT: STATION × WEEK di Importo (equivalente della pivot "Somma di Importo")
  const pv = wb.addWorksheet("PVT");
  pv.getCell("K1").value = "oggetto";
  pv.getCell("L1").value = `Transazioni Telepass ${e.anno}`;
  pv.getCell("A3").value = "Somma di Importo";
  pv.getCell("B3").value = "Etichette di colonna";
  pv.getCell("A4").value = "Etichette di riga";
  e.settimane.forEach((w, j) => (pv.getCell(4, 2 + j).value = w));
  const cT = 2 + e.settimane.length;
  pv.getCell(4, cT).value = "Totale complessivo";
  pv.getCell(4, cT + 2).value = "RMPP";
  pv.getCell(4, cT + 3).value = "ZTL";
  pv.getCell(4, cT + 4).value = "TOTALE";
  let r = 5;
  const tot = (st: string) => e.perStation[st] ?? 0;
  for (const st of e.stazioni) {
    pv.getCell(r, 1).value = st;
    e.settimane.forEach((w, j) => (pv.getCell(r, 2 + j).value = f(`SUMIFS(Toll[Importo],Toll[STATION],$A${r},Toll[WEEK],${L(2 + j)}$4)`, e.totali[st]?.[w] ?? 0)));
    pv.getCell(r, cT).value = f(`SUM(B${r}:${L(cT - 1)}${r})`, r2(tot(st)));
    pv.getCell(r, cT + 4).value = f(`-${L(cT)}${r}+${L(cT + 2)}${r}+${L(cT + 3)}${r}`, r2(-tot(st)));
    r++;
  }
  pv.getCell(r, 1).value = "Totale complessivo";
  for (let c = 2; c <= cT; c++) {
    const w = e.settimane[c - 2];
    const v = c < cT ? e.stazioni.reduce((s, st) => s + (e.totali[st]?.[w] ?? 0), 0) : e.totale;
    pv.getCell(r, c).value = f(`SUM(${L(c)}5:${L(c)}${r - 1})`, r2(v));
  }
  pv.getCell(r, cT + 2).value = f(`SUM(${L(cT + 2)}5:${L(cT + 2)}${r - 1})`, 0);
  pv.getCell(r, cT + 3).value = f(`SUM(${L(cT + 3)}5:${L(cT + 3)}${r - 1})`, 0);
  pv.getCell(r, cT + 4).value = f(`-${L(cT)}${r}+${L(cT + 2)}${r}+${L(cT + 3)}${r}`, r2(-e.totale));
  for (let c = 1; c <= cT + 4; c++) pv.getCell(4, c).font = bold;
  pv.getCell(r, 1).font = bold;
  pv.getColumn(1).width = 24;
  // riga di raccordo per station (come nel file di esempio)
  const r2r = r + 4;
  DS.forEach((st, j) => { const c = pv.getCell(r2r, 5 + j); c.value = st; c.font = bold; });
  pv.getCell(r2r, 12).value = "TOTALE";
  pv.getCell(r2r, 12).font = bold;
  let somma = 0;
  DS.forEach((st, j) => {
    const v = e.stazioni.includes(st) ? r2(-tot(st)) : 0;
    somma += v;
    pv.getCell(r2r + 1, 5 + j).value = f(`IFERROR(INDEX(${L(cT + 4)}5:${L(cT + 4)}${r - 1},MATCH("${st}",A5:A${r - 1},0)),0)`, v);
  });
  pv.getCell(r2r + 1, 12).value = f(`SUM(E${r2r + 1}:K${r2r + 1})`, r2(somma));

  // fogli manuali del mese: vuoti, stessa intestazione dell'esempio (li compila Alessandro)
  wb.addWorksheet("ztlrimini").addRow(["ZTL", "TARGA", "DATA RICHIESTA ATTIVAZIONE", "DAL", "AL", "NOTE", "WEEK"]);
  wb.addWorksheet("RMPP").addRow(["CODICE SOCIETA'", "DATA", "N. RAPPORTO", "TARGA", "DS", "CL.", "ENTRATA ", "ORA ENTRATA", "USCITA", "ORA USCITA", "IMPORTO", "IMPORTO VERSATO", "SPESE FISSE", "SPESE VISURA", "IMPORTO DOVUTO", "EVENTUALE NUMERO PROGRESSIVO"]);
  const an = wb.addWorksheet("Anomalie");
  an.addRow(["Tipo", "Chiave", "N. transazioni", "Nota"]);
  for (const a of e.anomalie) an.addRow([a.tipo, a.chiave === "" ? null : a.chiave, a.n, a.nota]);
  return wb;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
