import ExcelJS from "exceljs";
import type { Griglia } from "@/domain/fatture/fatturato";

/** Export di una vista del fatturato: tabella nativa, stile standard. */
export function excelGriglia(titolo: string, etichettaRiga: string, g: Griglia, nomeTabella: string): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FleetDSP";
  const ws = wb.addWorksheet(titolo.slice(0, 31));
  const cols = [etichettaRiga, ...g.colonne, "TOTALE"];
  ws.addTable({
    name: nomeTabella, ref: "A1", headerRow: true, totalsRow: false,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: cols.map((name) => ({ name, filterButton: true })),
    rows: [...g.righe.map((r) => [r, ...g.colonne.map((c) => g.valori[String(r)][c] ?? 0), g.totRiga[String(r)]]), ["TOTALE", ...g.colonne.map((c) => g.totCol[c]), g.totale]],
  });
  cols.forEach((_, i) => { const c = ws.getColumn(i + 1); c.width = i === 0 ? 14 : 14; if (i > 0) c.numFmt = "#,##0.00"; });
  return wb;
}
