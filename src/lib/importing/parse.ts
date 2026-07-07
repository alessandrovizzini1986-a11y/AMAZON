import "server-only";
import ExcelJS from "exceljs";
import Papa from "papaparse";

export type ParsedFile = { headers: string[]; rows: unknown[][] };

const MAX_ROWS = 10_000;

function normalizeCell(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    // exceljs: richText / hyperlink / formula
    const o = v as unknown as Record<string, unknown>;
    if ("richText" in o) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return o.text;
    if ("result" in o) return o.result;
    return String(v);
  }
  return v;
}

/**
 * Parsa .xlsx o .csv in {headers, rows}.
 * Le date Excel arrivano come oggetti Date REALI (non testo) — requisito
 * esplicito per evitare i problemi di data-come-stringa già visti su altri file.
 */
export async function parseImportFile(fileName: string, buffer: Buffer): Promise<ParsedFile> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const text = buffer.toString("utf-8");
    const res = Papa.parse<string[]>(text, { skipEmptyLines: true });
    if (res.errors.length > 0 && res.data.length === 0) {
      throw new Error(`CSV non leggibile: ${res.errors[0].message}`);
    }
    const [headers = [], ...rows] = res.data;
    return { headers: headers.map(String), rows: rows.slice(0, MAX_ROWS) };
  }

  if (lower.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    // usa il primo foglio che non sia "Istruzioni" (il template ne contiene uno)
    const ws =
      wb.worksheets.find((w) => w.name.toLowerCase() !== "istruzioni") ?? wb.worksheets[0];
    if (!ws) throw new Error("Il file non contiene fogli di lavoro");
    const headers: string[] = [];
    const rows: unknown[][] = [];
    ws.eachRow((row, rowNumber) => {
      const values: unknown[] = [];
      // row.values è 1-based
      for (let c = 1; c <= ws.columnCount; c++) {
        values.push(normalizeCell(row.getCell(c).value));
      }
      if (rowNumber === 1) {
        headers.push(...values.map((v) => (v === null ? "" : String(v))));
      } else if (values.some((v) => v !== null && v !== "")) {
        rows.push(values);
      }
    });
    return { headers, rows: rows.slice(0, MAX_ROWS) };
  }

  throw new Error("Formato non supportato: caricare .xlsx o .csv");
}
