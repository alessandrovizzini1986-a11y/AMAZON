/**
 * Stima del fatturato del mese: per mese × DS, il fatturato già arrivato (righe delle
 * fatture) più il previsto dal forecast per le settimane non ancora fatturate; i giorni
 * senza né fatture né forecast si contano a parte (stima incompleta).
 */
import { isRotta } from "@/domain/fatture/classifica";
import { inizioSettimana } from "./settimane";
import type { Previsione } from "./previsione";
import type { RigaCalibrazione } from "./tariffe";

export type RigaStimaMese = {
  mese: string; ds: string;
  /** € già fatturati nel mese (tutte le voci delle fatture) */
  fatturato: number;
  /** € previsti dal forecast nelle settimane non ancora fatturate (rotte + extra previsti) */
  previsto: number;
  totale: number;
  /** quota del totale già fatturata, 0–1 */
  quotaCerta: number;
  /** giorni del mese senza fatture né forecast */
  giorniSenza: number;
  /** stesso mese dell'anno prima, se le sue fatture sono sul sito */
  annoPrima: number | null;
};

const r2 = (x: number) => Math.round(x * 100) / 100;
const giorniMese = (m: string) => { const [a, b] = m.split("-").map(Number); const n = new Date(Date.UTC(a, b, 0)).getUTCDate(); return Array.from({ length: n }, (_, i) => `${m}-${String(i + 1).padStart(2, "0")}`); };
const annoPrimaDi = (m: string) => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`;

/** Settimane fatturate per DS: hanno almeno una riga di rotte in fattura. */
export function settimaneFatturate(righe: Pick<RigaCalibrazione, "ds" | "data" | "classe">[]): Set<string> {
  return new Set(righe.filter((r) => isRotta(r.classe)).map((r) => `${r.ds}|${inizioSettimana(r.data)}`));
}

export function stimaMese(x: { righe: RigaCalibrazione[]; previsioni: Previsione[]; mesi: string[] }): RigaStimaMese[] {
  const fatt = settimaneFatturate(x.righe);
  const anni = new Set(x.righe.map((r) => r.data.slice(0, 4)));
  const ds = [...new Set([...x.righe.filter((r) => isRotta(r.classe)).map((r) => r.ds), ...x.previsioni.map((p) => p.ds)])].sort();
  const perDsMese = new Map<string, number>();
  for (const r of x.righe) { const k = `${r.ds}|${r.data.slice(0, 7)}`; perDsMese.set(k, (perDsMese.get(k) ?? 0) + r.avere); }
  // previsto per DS e giorno, solo nelle settimane che quella DS non ha ancora in fattura
  const prevGiorno = new Map<string, number>();
  const coperti = new Set<string>();
  for (const p of x.previsioni) {
    if (fatt.has(`${p.ds}|${p.settimana}`)) continue;
    for (const [g, v] of Object.entries(p.perGiorno)) { prevGiorno.set(`${p.ds}|${g}`, (prevGiorno.get(`${p.ds}|${g}`) ?? 0) + v); coperti.add(`${p.ds}|${g}`); }
    if (!p.soloSD) for (let i = 0; i < 7; i++) { const d = new Date(Date.parse(p.settimana) + i * 864e5).toISOString().slice(0, 10); coperti.add(`${p.ds}|${d}`); }
  }
  const out: RigaStimaMese[] = [];
  for (const m of x.mesi) for (const d of ds) {
    const giorni = giorniMese(m);
    const fatturato = perDsMese.get(`${d}|${m}`) ?? 0;
    const previsto = giorni.reduce((t, g) => t + (prevGiorno.get(`${d}|${g}`) ?? 0), 0);
    const giorniSenza = giorni.filter((g) => !fatt.has(`${d}|${inizioSettimana(g)}`) && !coperti.has(`${d}|${g}`)).length;
    const totale = fatturato + previsto;
    const ap = annoPrimaDi(m);
    out.push({ mese: m, ds: d, fatturato: r2(fatturato), previsto: r2(previsto), totale: r2(totale), quotaCerta: totale ? fatturato / totale : 0, giorniSenza, annoPrima: anni.has(ap.slice(0, 4)) ? r2(perDsMese.get(`${d}|${ap}`) ?? 0) : null });
  }
  return out;
}

/** Mesi da mostrare: dal mese prima di oggi all'ultimo mese coperto dal forecast. */
export function mesiStima(oggi: string, ultimaDataForecast: string | null): string[] {
  const out: string[] = [];
  const [a, b] = oggi.slice(0, 7).split("-").map(Number);
  let y = b === 1 ? a - 1 : a, m = b === 1 ? 12 : b - 1;
  const fine = ultimaDataForecast && ultimaDataForecast.slice(0, 7) > oggi.slice(0, 7) ? ultimaDataForecast.slice(0, 7) : oggi.slice(0, 7);
  for (let k = 0; k < 24; k++) { const s = `${y}-${String(m).padStart(2, "0")}`; out.push(s); if (s >= fine) break; m++; if (m === 13) { m = 1; y++; } }
  return out;
}
