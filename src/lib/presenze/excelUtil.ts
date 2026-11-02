import ExcelJS from "exceljs";

export type Col = { name: string; width?: number; date?: boolean; numFmt?: string };
type V = string | number | boolean | Date | null | undefined;

const toDate = (iso: string) => new Date(iso + "T00:00:00Z");

/**
 * Tabella Excel nativa (stile standard, filtri) a partire da A<row>. Le colonne
 * `date` accettano "AAAA-MM-GG" e vengono scritte come date vere.
 */
export function tabella(ws: ExcelJS.Worksheet, name: string, cols: Col[], rows: V[][], startRow = 1) {
  const body = rows.length ? rows : [[`nessuno`, ...cols.slice(1).map(() => null)]];
  ws.addTable({
    name,
    ref: `A${startRow}`,
    headerRow: true,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: cols.map((c) => ({ name: c.name, filterButton: true })),
    rows: body.map((r) => r.map((v, i) => (cols[i]?.date && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? toDate(v) : v ?? null))),
  });
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width ?? Math.min(45, Math.max(10, c.name.length + 3));
    if (c.date) col.numFmt = "dd/mm/yyyy";
    else if (c.numFmt) col.numFmt = c.numFmt;
  });
  ws.views = [{ state: "frozen", ySplit: startRow }];
}

/** Scarica un workbook dal browser. */
export async function scarica(wb: ExcelJS.Workbook, nome: string) {
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
