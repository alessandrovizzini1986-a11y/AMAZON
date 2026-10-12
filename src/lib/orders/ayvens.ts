import "server-only";
import ExcelJS from "exceljs";
import { mapAyvensRows, type OrderInput } from "@/domain/orders";

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("richText" in o) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("result" in o) return typeof o.result === "object" && o.result && "error" in o.result ? null : o.result;
    if ("text" in o) return o.text;
    return null;
  }
  return v;
}

/** Legge il foglio "Lista Ordini" (o il primo con la colonna Ref_Ordine) dell'export Ayvens. */
export async function parseAyvensOrders(buffer: Buffer): Promise<OrderInput[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const hasRef = (ws: ExcelJS.Worksheet) =>
    (ws.getRow(1).values as unknown[]).some((v) => String(v ?? "").toLowerCase().replace(/[^a-z]/g, "") === "refordine");
  const ws = wb.worksheets.find((w) => w.name.toLowerCase() === "lista ordini" && hasRef(w)) ?? wb.worksheets.find(hasRef);
  if (!ws) throw new Error("Nel file non c'è il foglio \"Lista Ordini\" con la colonna Ref_Ordine");

  const read = (row: ExcelJS.Row) => {
    const out: unknown[] = [];
    for (let c = 1; c <= ws.columnCount; c++) out.push(cellValue(row.getCell(c).value));
    return out;
  };
  const headers = read(ws.getRow(1));
  const rows: unknown[][] = [];
  ws.eachRow((row, n) => { if (n > 1) rows.push(read(row)); });
  return mapAyvensRows(headers, rows);
}
