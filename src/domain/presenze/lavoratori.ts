/**
 * Lavoratori di un tracking con le ore per giorno divise per voce (porting di
 * leggi_tracking di controllo_zucchetti.py). Serve al controllo di fine mese
 * (tracking vs Zucchetti) e ai controlli domeniche / giorni consecutivi.
 */
import { at, text, type SheetGrid } from "./grid";
import { findTrackingSheet, headerCol, trackingBlocks } from "./tracking";

export const LAVORO = ["Standard", "Straordinario", "Supplementare", "Accordo"] as const;
export const ASSENZE_RETRIB = ["FERIE", "ROL", "ExF", "104", "MALATTIA", "INFORTUNIO", "PERM_SIND", "ALTRI_PERM"] as const;
/** Su Zucchetti si inseriscono tutte le ore tranne i riposi: anche permesso non retribuito e assenza ingiustificata. */
export const ASSENZE_NON_RETRIB = ["PERM_NR", "ASS_INGIUST"] as const;

export type Voce = (typeof LAVORO)[number] | (typeof ASSENZE_RETRIB)[number] | (typeof ASSENZE_NON_RETRIB)[number] | "Totali" | "RIPOSO" | "TRASFERTA" | "ALTRO";

/** Nome della riga "Tipo" → voce (come norm_voce dello script). */
export function normVoce(t: unknown): Voce {
  const s = text(t as never).trim().toLowerCase();
  const pref: [string, Voce][] = [
    ["standard", "Standard"], ["straord", "Straordinario"], ["supplement", "Supplementare"], ["accordo", "Accordo"],
    ["total", "Totali"], ["riposo", "RIPOSO"], ["ferie", "FERIE"], ["rol", "ROL"], ["exf", "ExF"], ["104", "104"],
    ["malatt", "MALATTIA"], ["infort", "INFORTUNIO"],
  ];
  for (const [k, v] of pref) if (s.startsWith(k)) return v;
  if (s.includes("ingiust")) return "ASS_INGIUST";
  if (s.includes("trasfert")) return "TRASFERTA";
  if (s.includes("sindac")) return "PERM_SIND";
  if (s.includes("altri perm")) return "ALTRI_PERM";
  if (s.includes("non retrib")) return "PERM_NR";
  return "ALTRO";
}

/** Matricola normalizzata: 1246.0 → "1246", S005113 resta com'è. */
export function matrKey(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim().toUpperCase();
  if (/^\d+(\.0+)?$/.test(s)) return String(Math.trunc(Number(s)));
  return s;
}

export type Lavoratore = {
  nome: string;
  cf: string;
  contratto: string;
  driverId: string;
  matricola: string;
  /** giorno ISO → voce → ore (solo giorni del mese) */
  giorni: Record<string, Partial<Record<Voce, number>>>;
};

/** Valore numerico di una cella come float() di Python (stringhe numeriche sì, "8,5" no). */
function pyFloat(v: unknown): number | null {
  if (v === null || v === undefined || v instanceof Date) return null;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = String(v).trim();
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s) ? parseFloat(s) : null;
}

export function leggiLavoratori(sheets: SheetGrid[], anno: number, mese: number): { lavoratori: Lavoratore[]; foglio: string } {
  const ts = findTrackingSheet(sheets, anno, mese);
  const prefix = `${anno}-${String(mese).padStart(2, "0")}-`;
  const days = ts.dayCols.filter((d) => d.date.startsWith(prefix));
  // nome: "Lavoratore", "Nominativo" o, in alcuni tracking (DLZ2 STD), la colonna "Driver" accanto a "Driver ID"
  const esatta = (h: string) => { const i = ts.header.findIndex((v) => v.trim() === h); return i >= 0 ? i : null; };
  const cNome = headerCol(ts, ["lavorat", "nominativ"]) ?? esatta("driver") ?? esatta("cognome e nome") ?? esatta("nome");
  const cCf = headerCol(ts, ["codice f"]);
  const cMatr = headerCol(ts, ["codice m"]);
  const cContr = headerCol(ts, ["tipo c"]);
  const cId = headerCol(ts, ["driver id", "id driver", "driver_id"]) ?? (esatta("driver") !== cNome ? headerCol(ts, ["driver"]) : null);
  const g = ts.grid;
  const str = (r: number, c: number | null) => (c === null ? "" : text(at(g, r, c)).trim());
  const out: Lavoratore[] = [];
  let cur: Lavoratore | null = null;
  for (let r = ts.headerRow + 1; r < g.rows.length; r++) {
    const t = at(g, r, ts.tipoCol);
    if (t === null || text(t).trim() === "") continue;
    const voce = normVoce(t);
    if (voce === "Standard") {
      cur = { nome: str(r, cNome), cf: str(r, cCf), contratto: str(r, cContr), driverId: str(r, cId), matricola: "", giorni: {} };
      out.push(cur);
    }
    if (!cur) continue;
    if (cMatr !== null && !cur.matricola) {
      const m = at(g, r, cMatr);
      if (m !== null && m !== "") cur.matricola = matrKey(m);
    }
    if (voce === "Totali" || voce === "RIPOSO" || voce === "TRASFERTA" || voce === "ALTRO") continue;
    for (const { col, date } of days) {
      const v = pyFloat(at(g, r, col));
      if (v && v <= 24) {
        const giorno = (cur.giorni[date] ??= {});
        giorno[voce] = (giorno[voce] ?? 0) + v;
      }
    }
  }
  return { lavoratori: out, foglio: g.name };
}

/** Ore di sole voci di lavoro (Standard + Straordinario + Supplementare + Accordo) di un giorno. */
export function oreLavoro(l: Lavoratore, iso: string): number {
  const g = l.giorni[iso];
  if (!g) return 0;
  return LAVORO.reduce((s, v) => s + (g[v] ?? 0), 0);
}

