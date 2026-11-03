/**
 * Righe dello storico (foglio fatt_2026 / fatt_2025 del file AGGREGATO, o il
 * CSV del kit) → righe normalizzate con classe e chiave anti-doppioni (SPEC §3.3).
 */
import { amazonWeek } from "./parser";
import { classifica } from "./classifica";
import { normalizzaNumero } from "./numero";

export type RigaStorico = {
  numero: string; ds: string; data: string; descrizione: string; quantita: number; prezzo: number; tasse: string; rateo: number;
  importoIva: number; totale: number; avere: number; microarea: string | null; macroarea: string | null;
  week: number; mese: number; anno: number; classe: string; chiave: string;
};

type Val = string | number | boolean | null | undefined;

const num = (v: Val): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  return s.includes(",") ? parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0 : parseFloat(s) || 0;
};
const r2 = (x: number) => Math.round(x * 100) / 100;
/** Rateo IVA: 0.22, "0,22", "22%" o 22 → 0.22 */
const rateo = (v: Val): number => {
  if (typeof v === "string" && v.trim().endsWith("%")) return num(v.trim().slice(0, -1)) / 100;
  const x = num(v);
  return x > 1 ? x / 100 : x;
};

/** Data come seriale Excel, Date, "AAAA-MM-GG" o "gg/mm/aaaa" → "AAAA-MM-GG" */
export function isoData(v: Val | Date): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

export type EsitoStorico = { righe: RigaStorico[]; scartate: number; senzaNumero: number };

/**
 * Normalizza le righe (intestazioni come colonne_fatt_2026). Numero vuoto →
 * SENZA-NUMERO-<DS>-<anno>-<week>. La chiave è numero|data|descrizione|quantità|avere
 * più il numero di occorrenza: due righe identiche nella stessa fattura restano due,
 * e reimportare lo stesso file produce le stesse chiavi (nessun doppione).
 */
export function righeStorico(rows: Record<string, Val>[]): EsitoStorico {
  const occ = new Map<string, number>();
  const out: RigaStorico[] = [];
  let scartate = 0, senzaNumero = 0;
  for (const x of rows) {
    const data = isoData(x["Data"] as Val);
    const ds = String(x["DS"] ?? "").trim().toUpperCase();
    const descrizione = String(x["Descrizione"] ?? "").replace(/_x000D_/g, "").replace(/\s+/g, " ").trim();
    if (!data || !ds || !descrizione) { scartate++; continue; }
    const d = new Date(data + "T00:00:00Z");
    const week = num(x["WEEK"]) || amazonWeek(d);
    const mese = num(x["MESE"]) || d.getUTCMonth() + 1;
    const anno = num(x["ANNO"]) || d.getUTCFullYear();
    let numero = normalizzaNumero(x["Numero"] as string);
    if (!numero) { numero = `SENZA-NUMERO-${ds}-${anno}-${week}`; senzaNumero++; }
    const totale = r2(num(x["Totale (€)"]));
    const importoIva = r2(num(x["Importo IVA (€)"]));
    const avere = r2(num(x["AVERE"]));
    const quantita = Math.round(num(x["Quantità"]));
    const base = `${numero}|${data}|${descrizione}|${quantita}|${avere.toFixed(2)}`;
    const k = (occ.get(base) ?? 0) + 1;
    occ.set(base, k);
    const testo = (v: Val) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());
    out.push({
      numero, ds, data, descrizione, quantita, prezzo: num(x["Prezzo (€)"]), tasse: testo(x["Tasse"]) ?? "", rateo: rateo(x["Rateo IVA"]),
      importoIva, totale, avere, microarea: testo(x["MICROAREA"]), macroarea: testo(x["MACROAREA"]), week, mese, anno,
      classe: classifica(descrizione), chiave: `${base}|${k}`,
    });
  }
  return { righe: out, scartate, senzaNumero };
}

/** Fatture dallo storico: somme delle righe, date min/max. */
export function fattureDaStorico(righe: RigaStorico[]) {
  const m = new Map<string, { numero: string; ds: string; da: string; a: string; totale: number; avere: number; nRighe: number }>();
  for (const r of righe) {
    const f = m.get(r.numero) ?? { numero: r.numero, ds: r.ds, da: r.data, a: r.data, totale: 0, avere: 0, nRighe: 0 };
    if (r.data < f.da) f.da = r.data;
    if (r.data > f.a) f.a = r.data;
    f.totale += r.totale;
    f.avere += r.avere;
    f.nRighe++;
    m.set(r.numero, f);
  }
  return [...m.values()].map((f) => ({ ...f, totale: r2(f.totale), avere: r2(f.avere) }));
}
