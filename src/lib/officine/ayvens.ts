import "server-only";
import ExcelJS from "exceljs";
import { parseCentri, type Centro } from "@/domain/officine";

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && !(v instanceof Date)) {
    const o = v as unknown as Record<string, unknown>;
    if ("richText" in o) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("result" in o) return o.result ?? null;
    if ("text" in o) return o.text;
    return null;
  }
  return v;
}

/**
 * Legge il file "Lista centri autorizzati" di Ayvens (.xlsm o .xlsx): usa il
 * foglio "Lista Centri" se c'è, altrimenti il primo che contiene la tabella.
 * Le macro del file non vengono mai eseguite: si leggono solo i valori.
 */
export async function parseAyvensCentri(buffer: Buffer): Promise<Centro[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheets = [...wb.worksheets].sort((a, b) => Number(b.name === "Lista Centri") - Number(a.name === "Lista Centri"));
  let lastError: unknown = null;
  for (const ws of sheets) {
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const values: unknown[] = [];
      for (let c = 1; c <= ws.columnCount; c++) values.push(cellValue(row.getCell(c).value));
      rows.push(values);
    });
    try {
      return parseCentri(rows);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Nessun foglio con la lista centri");
}
