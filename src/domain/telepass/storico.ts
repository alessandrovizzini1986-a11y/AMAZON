/**
 * File mensili GIÀ ELABORATI (quelli che si tenevano prima del sito): Q8 "MM_Transazioni_<Mese>_AA_Q8.xlsx" con la
 * colonna STATION su ogni transazione, Telepass "MM_Telepass_<Mese>_AAAA.xlsx" con il foglio PVT (pedaggi per
 * station e settimana, colonne RMPP e ZTL). Diventano un'elaborazione del mese come quelle fatte nel sito.
 * Verificato su ottobre 2026: stessi totali per station dell'elaborazione fatta nel sito.
 */
import { mesePrevalente, weeknumExcel } from "./comune";

type Cella = string | number | boolean | Date | null | undefined;
export type TotaliRun = Record<string, Record<string, number>>;

const t = (v: Cella) => (v === null || v === undefined ? "" : String(v).trim());
const r2 = (x: number) => Math.round(x * 100) / 100;
const data = (v: Cella): Date | null => {
  if (v instanceof Date) return v;
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000));
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t(v)) ?? null;
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const i = /^(\d{4})-(\d{2})-(\d{2})/.exec(t(v));
  return i ? new Date(Date.UTC(+i[1], +i[2] - 1, +i[3])) : null;
};
/** Le station del file vanno come nel sito: "GLS - CASTELMAGGIORE" (Q8) → GLS. */
const stationQ8 = (s: string) => (s.toUpperCase().startsWith("GLS") ? "GLS" : s.toUpperCase());

/** Q8 elaborato: somma di "Imp. Scontato no IVA" per STATION e settimana; mese = quello prevalente delle date. */
export function storicoQ8(m: Cella[][]): { anno: number; mese: number; totali: TotaliRun; totale: number; righe: number; senzaStation: number } {
  const hr = m.findIndex((r) => r.some((v) => t(v) === "STATION") && r.some((v) => t(v) === "Imp. Scontato no IVA"));
  if (hr < 0) throw new Error('non trovo le colonne "STATION" e "Imp. Scontato no IVA": non è un file Q8 elaborato');
  const h = m[hr].map(t);
  const c = { st: h.indexOf("STATION"), d: h.indexOf("Data"), imp: h.indexOf("Imp. Scontato no IVA") };
  if (c.d < 0) throw new Error('manca la colonna "Data"');
  const totali: TotaliRun = {};
  const date: Date[] = [];
  let righe = 0, senzaStation = 0, totale = 0;
  for (const r of m.slice(hr + 1)) {
    const d = data(r[c.d] as Cella), imp = r[c.imp];
    if (!d || typeof imp !== "number") continue;
    const s = stationQ8(t(r[c.st] as Cella));
    if (!s) { senzaStation++; continue; }
    const w = String(weeknumExcel(d));
    const x = (totali[s] ??= {});
    x[w] = r2((x[w] ?? 0) + imp);
    date.push(d); righe++; totale += imp;
  }
  if (!righe) throw new Error("nessuna transazione con data e importo");
  return { ...mesePrevalente(date), totali, totale: r2(totale), righe, senzaStation };
}

/** Telepass elaborato: foglio PVT, righe = station, colonne = settimane (importi negativi) + RMPP e ZTL (positivi, salvati negativi come i pedaggi). */
export function storicoTelepass(m: Cella[][]): { totali: TotaliRun; totale: number; perStation: Record<string, number> } {
  const hr = m.findIndex((r) => t(r[0]) === "Etichette di riga");
  if (hr < 0) throw new Error('nel foglio PVT non trovo la riga "Etichette di riga"');
  const h = m[hr].map(t);
  const sett = h.map((x, i) => [i, x] as const).filter(([, x]) => /^\d+(\.0)?$/.test(x)).map(([i, x]) => [i, String(Number(x))] as const);
  const cx = { rmpp: h.indexOf("RMPP"), ztl: h.indexOf("ZTL") };
  const totali: TotaliRun = {}, perStation: Record<string, number> = {};
  let totale = 0;
  for (const r of m.slice(hr + 1)) {
    const s = t(r[0] as Cella);
    if (!s || s.toLowerCase().startsWith("totale")) break;
    const d: Record<string, number> = {};
    for (const [i, w] of sett) if (typeof r[i] === "number" && r[i]) d[w] = r2(r[i] as number);
    for (const [k, i] of [["RMPP", cx.rmpp], ["ZTL", cx.ztl]] as const) if (i >= 0 && typeof r[i] === "number" && r[i]) d[k] = -r2(Math.abs(r[i] as number));
    totali[s] = d;
    perStation[s] = r2(Object.values(d).reduce((a, v) => a + Math.abs(v), 0));
    totale += Object.values(d).reduce((a, v) => a + v, 0);
  }
  if (!Object.keys(totali).length) throw new Error("foglio PVT senza station");
  return { totali, totale: r2(totale), perStation };
}

/** Mese dal nome del file: "07_Telepass_Luglio_2026.xlsx", "01_Transazioni_Gennaio_26_Q8.xlsx". */
export function meseDaNome(nome: string): { anno: number; mese: number } | null {
  const m = /(?:^|[^\d])(\d{2})_[A-Za-z]+_[A-Za-z]+_(\d{2}|\d{4})(?:[_.])/.exec(nome) ?? /(?:^|[^\d])(\d{2})_[A-Za-z]+_(\d{4})/.exec(nome);
  if (!m) return null;
  const mese = Number(m[1]), anno = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  return mese >= 1 && mese <= 12 ? { anno, mese } : null;
}

/** Somma per station (valore assoluto) di totali per settimana. */
export const perStationRun = (tot: TotaliRun) => Object.fromEntries(Object.entries(tot).map(([s, w]) => [s, r2(Math.abs(Object.values(w).reduce((a, v) => a + v, 0)))]));
