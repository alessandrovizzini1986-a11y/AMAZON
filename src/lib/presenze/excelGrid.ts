import ExcelJS from "exceljs";
import type { Cell, SheetGrid } from "@/domain/presenze/grid";

/** Valore di una cella ExcelJS → valore semplice (come openpyxl con data_only=True). */
function plain(v: ExcelJS.CellValue): { value: Cell; formula: boolean } {
  if (v === null || v === undefined) return { value: null, formula: false };
  if (v instanceof Date || typeof v === "number" || typeof v === "string" || typeof v === "boolean") return { value: v, formula: false };
  const o = v as unknown as Record<string, unknown>;
  if ("formula" in o || "sharedFormula" in o) {
    const r = o.result as unknown;
    if (r === undefined || r === null) return { value: null, formula: true };
    if (typeof r === "object" && !(r instanceof Date)) {
      const ro = r as Record<string, unknown>;
      return { value: "error" in ro ? String(ro.error) : null, formula: true };
    }
    return { value: r as Cell, formula: true };
  }
  if ("richText" in o) return { value: (o.richText as { text: string }[]).map((t) => t.text).join(""), formula: false };
  if ("text" in o) return { value: String(o.text), formula: false };
  if ("error" in o) return { value: String(o.error), formula: false };
  return { value: null, formula: false };
}

function noteText(n: ExcelJS.Cell["note"]): string | null {
  if (!n) return null;
  if (typeof n === "string") return n;
  const texts = (n as { texts?: { text: string }[] }).texts;
  return texts ? texts.map((t) => t.text).join("") : null;
}

/** Foglio ExcelJS → griglia neutra (indici 0-based). */
export function worksheetToGrid(ws: ExcelJS.Worksheet): SheetGrid {
  const rows: Cell[][] = [];
  const formulas = new Set<string>();
  const notes = new Map<string, string>();
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const r = rowNumber - 1;
    const out: Cell[] = [];
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const c = colNumber - 1;
      const { value, formula } = plain(cell.value);
      out[c] = value;
      if (formula) formulas.add(`${r}:${c}`);
      const nt = noteText(cell.note);
      if (nt) notes.set(`${r}:${c}`, nt);
    });
    for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = null;
    rows[r] = out;
  });
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return { name: ws.name, rows, formulas, notes };
}

/** Intero file Excel (.xlsx/.xlsm) → fogli in formato neutro. Le macro non vengono mai eseguite. */
export async function workbookToGrids(data: ArrayBuffer | Uint8Array): Promise<SheetGrid[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as ArrayBuffer);
  return wb.worksheets.map(worksheetToGrid);
}
