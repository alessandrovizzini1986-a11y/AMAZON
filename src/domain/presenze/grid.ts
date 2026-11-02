/**
 * Rappresentazione neutra di un foglio Excel (indipendente da ExcelJS), così
 * la logica dei controlli presenze è pura e testabile in Node come nel browser.
 * Indici di riga e colonna 0-based.
 */
export type Cell = string | number | boolean | Date | null;

export type SheetGrid = {
  name: string;
  rows: Cell[][];
  /** celle con formula ("r:c"): serve a distinguere trasferta calcolata da scritta a mano */
  formulas: Set<string>;
  /** commenti di cella ("r:c" → testo) */
  notes: Map<string, string>;
};

export const at = (g: SheetGrid, r: number, c: number): Cell => g.rows[r]?.[c] ?? null;
export const key = (r: number, c: number) => `${r}:${c}`;

/** Data Excel (Date UTC a mezzanotte) → "AAAA-MM-GG". */
export function isoOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function isoFromParts(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? isoOf(dt) : null;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return isoOf(new Date(Date.UTC(y, m - 1, d + n)));
}

/** 0 = lunedì … 6 = domenica */
export function weekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const GG = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/** Come num() degli script: numero, testo numerico con virgola, booleano; altrimenti 0. */
export function num(v: Cell): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return 0;
  const s = String(v).trim().replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return 0;
  return parseFloat(s);
}

/** Testo come str() di Python per i valori di cella (8 → "8", 6.5 → "6.5"). */
export function text(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isoOf(v);
  if (typeof v === "boolean") return v ? "True" : "False";
  return String(v);
}

/** Formato {x:g} di Python per i numeri nelle note (8 → "8", 6.5 → "6.5"). */
export const g = (x: number) => String(Number.isInteger(x) ? x : Math.round(x * 1e6) / 1e6);
