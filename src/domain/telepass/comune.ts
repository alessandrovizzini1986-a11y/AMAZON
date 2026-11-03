/**
 * Costanti e utilità del modulo "Telepass e carburante" (porting di
 * docs/telepass-q8-kit/riferimento/mensile_telepass_q8.py).
 */
import { text, type Cell, type SheetGrid } from "@/domain/presenze/grid";

export const MESI = ["", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
/** Ordine delle righe nelle griglie STATION × WEEK */
export const STATIONS_ORD = ["DER1", "DER2", "DLO2", "DLO4", "DLO5", "DLZ2", "DVN1", "GLS", "GLS - CASTEL MAGGIORE", "SEDE"];
export const DS = ["DER1", "DER2", "DLO2", "DLO4", "DLO5", "DLZ2", "DVN1"];
/** Station ammesse per un dispositivo Telepass; le altre (es. VALERIO, VIZZINI) → GLS - CASTEL MAGGIORE */
export const STATION_TELEPASS = [...DS, "SEDE", "GLS - CASTEL MAGGIORE"];
export const GLS_CM = "GLS - CASTEL MAGGIORE";
/** Valori di DS ammessi per una fuel card */
export const DS_CARTA = [...DS, "GLS"];

export const ordinaStation = (a: string, b: string) => {
  const ia = STATIONS_ORD.indexOf(a), ib = STATIONS_ORD.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a < b ? -1 : a > b ? 1 : 0);
};

/** WEEKNUM di Excel, sistema 1 (la settimana inizia di domenica). */
export function weeknumExcel(d: Date): number {
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  const giorni = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - jan1) / 86_400_000);
  return Math.floor((giorni + new Date(jan1).getUTCDay()) / 7) + 1;
}

/** Settimane (WEEKNUM) che toccano il mese. */
export function settimaneDelMese(anno: number, mese: number): number[] {
  const n = new Date(Date.UTC(anno, mese, 0)).getUTCDate();
  return [...new Set(Array.from({ length: n }, (_, i) => weeknumExcel(new Date(Date.UTC(anno, mese - 1, i + 1)))))].sort((a, b) => a - b);
}

export const giorniNelMese = (anno: number, mese: number) => new Date(Date.UTC(anno, mese, 0)).getUTCDate();

/** Mese più frequente fra le date (a pari merito vince il primo incontrato, come max() di Python su dict). */
export function mesePrevalente(date: (Date | null)[]): { anno: number; mese: number } {
  const c = new Map<string, number>();
  for (const d of date) if (d) { const k = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`; c.set(k, (c.get(k) ?? 0) + 1); }
  if (!c.size) throw new Error("nessuna data valida nella colonna Data");
  let best = "", n = -1;
  for (const [k, v] of c) if (v > n) { best = k; n = v; }
  const [anno, mese] = best.split("-").map(Number);
  return { anno, mese };
}

/** Numero all'italiana come num_it dello script: "-2,40" → -2.4, "1.234,5" → 1234.5, "" → null; testo non numerico resta testo. */
export function numIt(s: string | null | undefined): number | string | null {
  if (s === null || s === undefined || s === "") return null;
  const str = String(s);
  if (/^(-?\d{1,3}(\.\d{3})*,\d+|-?\d+,\d+)$/.test(str)) return parseFloat(str.replace(/\./g, "").replace(",", "."));
  const t = str.replace(",", ".").trim();
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t) ? parseFloat(t) : str;
}

/** str(x).strip() come Python per una cella (None → ""). */
export function pyStr(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  return text(v).trim();
}

/** Indice di una colonna per intestazione (prefisso, senza maiuscole/spazi ai lati). */
export function colonna(hdr: string[], ...prefissi: string[]): number {
  const h = hdr.map((x) => x.trim().toLowerCase());
  for (const p of prefissi) {
    const i = h.findIndex((x) => x === p.toLowerCase());
    if (i >= 0) return i;
  }
  for (const p of prefissi) {
    const i = h.findIndex((x) => x.startsWith(p.toLowerCase()));
    if (i >= 0) return i;
  }
  return -1;
}

export const rigaTesto = (g: SheetGrid, r: number) => (g.rows[r] ?? []).map((v) => (v === null || v === undefined ? "" : text(v).trim()));
