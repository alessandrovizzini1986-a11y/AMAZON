import ExcelJS from "exceljs";
import { FORMATI_Q8, type EsitoQ8 } from "@/domain/telepass/q8";
import { giorniNelMese, weeknumExcel } from "@/domain/telepass/comune";
import { L } from "@/lib/presenze/excelFineMese";

const f = (formula: string, result?: number | string) => ({ formula, result }) as ExcelJS.CellFormulaValue;
const bold = { bold: true };
const r2 = (x: number) => Math.round(x * 100) / 100;

const LARGHEZZE: Record<string, number> = { C: 28, D: 21, G: 11, H: 10, J: 10, L: 10, M: 13, R: 34, S: 18 };

/**
 * MM_Transazioni_<Mese>_<AA>_Q8.xlsx come l'atteso: Recap (STATION × WEEK e
 * giornaliero per la STATION della cella filtro), tabella Q8_, Anomalie.
 */
export function excelQ8(e: EsitoQ8, filtroStation = "GLS"): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FleetDSP";
  const rc = wb.addWorksheet("Recap");
  const ws = wb.addWorksheet("Transazioni Q8 Flotte");
  const nc = e.intestazione.length; // 37
  const n0 = nc - 2;
  const iIdent = e.intestazione.indexOf("Identificativo");
  ws.addTable({
    name: "Q8_",
    ref: "A1",
    headerRow: true,
    style: { theme: "TableStyleMedium2", showRowStripes: true, showColumnStripes: false, showFirstColumn: false, showLastColumn: false },
    columns: e.intestazione.map((name) => ({ name, filterButton: true })),
    rows: (e.righe.length ? e.righe : [Array(n0).fill(null)]).map((r) => [
      ...Array.from({ length: n0 }, (_, j) => r[j] ?? null),
      f("LEFT(Q8_[[#This Row],[Identificativo]],3)", String(r[iIdent] ?? "").slice(0, 3)),
      f("WEEKNUM(Q8_[[#This Row],[Data]])", r[e.iData] instanceof Date ? weeknumExcel(r[e.iData] as Date) : undefined),
    ]),
  });
  const formati = e.intestazione.map((h) => FORMATI_Q8[h]);
  for (let r = 2; r <= e.righe.length + 1; r++) {
    ws.getCell(r, e.iData + 1).numFmt = "mm-dd-yy";
    ws.getCell(r, e.iOra + 1).numFmt = "h:mm:ss";
    formati.forEach((fm, j) => { if (fm) ws.getCell(r, j + 1).numFmt = fm; });
  }
  for (const [c, w] of Object.entries(LARGHEZZE)) ws.getColumn(c).width = w;

  // Recap: STATION × WEEK di Imp. Scontato no IVA (equivalente della pivot in Foglio2)
  rc.getCell("A3").value = "Somma di Imp. Scontato no IVA";
  rc.getCell("B3").value = "Etichette di colonna";
  rc.getCell("A4").value = "Etichette di riga";
  e.settimane.forEach((w, j) => (rc.getCell(4, 2 + j).value = w));
  const cT = 2 + e.settimane.length;
  rc.getCell(4, cT).value = "Totale complessivo";
  const tot = (st: string) => e.perStation[st] ?? 0;
  let r = 5;
  for (const st of e.stazioni) {
    rc.getCell(r, 1).value = st;
    e.settimane.forEach((w, j) => (rc.getCell(r, 2 + j).value = f(`SUMIFS(Q8_[Imp. Scontato no IVA],Q8_[STATION],$A${r},Q8_[WEEK],${L(2 + j)}$4)`, e.totali[st]?.[w] ?? 0)));
    rc.getCell(r, cT).value = f(`SUM(B${r}:${L(cT - 1)}${r})`, r2(tot(st)));
    r++;
  }
  rc.getCell(r, 1).value = "Totale complessivo";
  for (let c = 2; c <= cT; c++) {
    const w = e.settimane[c - 2];
    rc.getCell(r, c).value = f(`SUM(${L(c)}5:${L(c)}${r - 1})`, r2(c < cT ? e.stazioni.reduce((s, st) => s + (e.totali[st]?.[w] ?? 0), 0) : e.totale));
  }
  for (let c = 1; c <= cT; c++) rc.getCell(4, c).font = bold;
  rc.getCell(r, 1).font = bold;
  for (let rr = 5; rr <= r; rr++) for (let c = 2; c <= cT; c++) rc.getCell(rr, c).numFmt = "#,##0.00";

  // giornaliero di Imp. Scontato per la STATION della cella filtro (seconda pivot dell'esempio)
  r += 3;
  rc.getCell(r, 1).value = "STATION";
  rc.getCell(r, 2).value = filtroStation;
  rc.getCell(r, 1).font = bold;
  const fst = `$B$${r}`;
  r++;
  rc.getCell(r, 1).value = "Giorno";
  rc.getCell(r, 2).value = "Somma di Imp. Scontato";
  rc.getCell(r, 3).value = "Giorno sett.";
  r++;
  const nd = giorniNelMese(e.anno, e.mese);
  let somma = 0;
  for (let g = 1; g <= nd; g++) {
    const d = new Date(Date.UTC(e.anno, e.mese - 1, g));
    rc.getCell(r, 1).value = d;
    rc.getCell(r, 1).numFmt = "dd-mmm";
    const v = e.giornaliero[filtroStation]?.[g] ?? 0;
    somma += v;
    rc.getCell(r, 2).value = f(`SUMPRODUCT((INT(Q8_[Data])=A${r})*(Q8_[STATION]=${fst})*Q8_[Imp. Scontato])`, v);
    rc.getCell(r, 2).numFmt = "#,##0.00";
    rc.getCell(r, 3).value = f(`WEEKDAY(A${r})`, d.getUTCDay() + 1);
    r++;
  }
  rc.getCell(r, 1).value = "Totale complessivo";
  rc.getCell(r, 2).value = f(`SUM(B${r - nd}:B${r - 1})`, r2(somma));
  rc.getCell(r, 2).numFmt = "#,##0.00";
  rc.getColumn(1).width = 26;
  rc.getColumn(2).width = 20;

  const an = wb.addWorksheet("Anomalie");
  an.addRow(["Tipo", "PAN", "Identificativo", "N. transazioni", "Nota"]);
  for (const a of e.anomalie) an.addRow([a.tipo, a.pan || null, a.identificativo, a.n, a.nota]);
  return wb;
}
