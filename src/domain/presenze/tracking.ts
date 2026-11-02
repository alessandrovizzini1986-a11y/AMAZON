/**
 * Lettura dei file "tracking" (ore per driver e giorno) compilati dagli
 * Operations. Porta in TypeScript la parte comune di controllo_trasferte_v2.py
 * e controllo_zucchetti.py: foglio del mese, riga di intestazione con "Tipo",
 * colonne giorno (date o interi 1..31 con sconfinamento di mese), blocchi per
 * lavoratore che iniziano dalla riga "Standard".
 */
import { at, isoFromParts, isoOf, key, text, type Cell, type SheetGrid } from "./grid";

export type DayCol = { col: number; date: string };

export type TrackingSheet = {
  grid: SheetGrid;
  headerRow: number;
  tipoCol: number;
  /** colonne giorno (tutte, anche fuori mese: i controlli filtrano sul periodo) */
  dayCols: DayCol[];
  header: string[]; // intestazione in minuscolo
};

export type TrackingBlock = {
  /** righe del blocco (indici nel foglio), la prima è "Standard" */
  rows: number[];
};

const lower = (v: Cell) => text(v).trim().toLowerCase();

function findHeader(g: SheetGrid): { row: number; tipoCol: number } | null {
  for (let r = 0; r < Math.min(8, g.rows.length); r++) {
    const row = g.rows[r] ?? [];
    const c = row.findIndex((v) => lower(v) === "tipo");
    if (c >= 0) return { row: r, tipoCol: c };
  }
  return null;
}

/**
 * Colonne giorno dopo "Tipo". Date vere: si prendono tutte, le colonne
 * "totale" intercalate (DLO5/DVN1) si saltano. Interi 1..31: rollover di mese
 * (28-29-30-31 iniziali = mese precedente, dopo il 31 viene il mese successivo)
 * e stop al primo "Totale" (DER1/DER2/DLZ2 hanno subtotali dopo).
 */
function dayColumns(g: SheetGrid, headerRow: number, tipoCol: number, anno: number, mese: number): DayCol[] {
  const hdr = g.rows[headerRow] ?? [];
  const out: DayCol[] = [];
  let m: number | null = null;
  let prev: number | null = null;
  let intmode = false;
  for (let c = tipoCol + 1; c < hdr.length; c++) {
    const h = hdr[c];
    if (h === null || h === undefined || h === "") continue;
    if (h instanceof Date) {
      out.push({ col: c, date: isoOf(h) });
      continue;
    }
    const s = text(h).trim();
    const sl = s.toLowerCase();
    if (sl.startsWith("tot") || sl.startsWith("somma")) {
      if (intmode) break;
      continue;
    }
    if (/^\d{1,2}$/.test(s) && Number(s) >= 1 && Number(s) <= 31) {
      const d = Number(s);
      intmode = true;
      if (m === null) m = d >= 28 ? mese - 1 : mese;
      else if (prev !== null && d < prev) m += 1;
      prev = d;
      let y = anno;
      let mm = m;
      if (mm < 1) { mm = 12; y = anno - 1; }
      else if (mm > 12) { mm = 1; y = anno + 1; }
      const iso = isoFromParts(y, mm, d);
      if (iso) out.push({ col: c, date: iso });
    }
  }
  return out;
}

/**
 * Sceglie il foglio le cui colonne-giorno coprono più giorni del mese
 * richiesto (il nome del foglio può essere "10.26", "Ottobre", "Settembre2026"
 * o perfino il mese sbagliato: conta il contenuto).
 */
export function findTrackingSheet(sheets: SheetGrid[], anno: number, mese: number): TrackingSheet {
  const prefix = `${anno}-${String(mese).padStart(2, "0")}-`;
  let best: { n: number; ts: TrackingSheet } | null = null;
  let headerFound = false;
  for (const g of sheets) {
    const h = findHeader(g);
    if (!h) continue;
    headerFound = true;
    const dayCols = dayColumns(g, h.row, h.tipoCol, anno, mese);
    const n = dayCols.filter((d) => d.date.startsWith(prefix)).length;
    if (n > 0 && (!best || n > best.n)) {
      best = {
        n,
        ts: { grid: g, headerRow: h.row, tipoCol: h.tipoCol, dayCols, header: (g.rows[h.row] ?? []).map(lower) },
      };
    }
  }
  if (!best) {
    throw new Error(
      headerFound
        ? `nessun foglio con i giorni di ${String(mese).padStart(2, "0")}/${anno}`
        : 'riga di intestazione con "Tipo" non trovata',
    );
  }
  return best.ts;
}

/** Blocchi per lavoratore: dalla riga "Standard" fino alla successiva. */
export function trackingBlocks(ts: TrackingSheet): TrackingBlock[] {
  const blocks: TrackingBlock[] = [];
  for (let r = ts.headerRow + 1; r < ts.grid.rows.length; r++) {
    const t = at(ts.grid, r, ts.tipoCol);
    if (t === null || t === undefined) continue;
    if (lower(t) === "standard") blocks.push({ rows: [r] });
    else if (blocks.length) blocks[blocks.length - 1].rows.push(r);
  }
  return blocks;
}

/** Colonna la cui intestazione inizia con una delle opzioni (in ordine di preferenza). */
export function headerCol(ts: TrackingSheet, opts: string[], maxCol = Infinity): number | null {
  for (const o of opts) {
    const i = ts.header.findIndex((v, j) => j < maxCol && v.startsWith(o));
    if (i >= 0) return i;
  }
  return null;
}

export const cellNote = (ts: TrackingSheet, r: number, c: number) => ts.grid.notes.get(key(r, c)) ?? null;
export const isFormula = (ts: TrackingSheet, r: number, c: number) => ts.grid.formulas.has(key(r, c));

/** Popolazione dal nome file: "Sic"/"SIC" → SIC, "std"/"STD" → STD. */
export function tipoFromName(fileName: string): "SIC" | "STD" | null {
  const up = fileName.toUpperCase();
  if (/(^|[^A-Z])SIC([^A-Z]|$)/.test(up) || up.includes("_SIC_")) return "SIC";
  if (/(^|[^A-Z])STD([^A-Z]|$)/.test(up) || up.includes("_STD_")) return "STD";
  return up.includes("SIC") ? "SIC" : up.includes("STD") ? "STD" : null;
}
