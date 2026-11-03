/**
 * Export Q8 Flotte (xlsx, intestazione in riga 2) → righe della tabella Q8_,
 * con STATION dal censimento fuel card (porting della funzione q8() dello script).
 */
import type { Cell, SheetGrid } from "@/domain/presenze/grid";
import { cartaNonAttribuita, type Carta } from "./anagrafiche";
import { mesePrevalente, MESI, ordinaStation, pyStr, rigaTesto, settimaneDelMese, weeknumExcel } from "./comune";

/** Riga d'intestazione (0-based, fra le prime 3) con "PAN Carta" e "N. ticket", o -1. */
export function rigaIntestazioneQ8(g: SheetGrid): number {
  for (let r = 0; r < Math.min(3, g.rows.length); r++) {
    const v = rigaTesto(g, r);
    if (v.includes("PAN Carta") && v.includes("N. ticket")) return r;
  }
  return -1;
}
export const isQ8 = (sheets: SheetGrid[]) => sheets.length > 0 && rigaIntestazioneQ8(sheets[0]) >= 0;

/** Formati numerici delle colonne (dall'atteso, "#,###0.000" dell'export → "##,##0.000"). */
export const FORMATI_Q8: Record<string, string> = {
  "Imp. intero": "#,##0.00", "Imp. intero no IVA": "#,##0.00", Volume: "#,##0.00",
  "Prezzo EUR/l": "##,##0.000", "Sconto EUR/l": "##,##0.000", "Prezzo Scontato": "##,##0.000",
  "Imp. Scontato": "#,##0.00", "Imp. Scontato no IVA": "#,##0.00", "IVA Imp. Intero": "#,##0.00",
};

export type AnomaliaQ8 = { tipo: string; pan: string | null; identificativo: string; n: number; nota: string };

export type EsitoQ8 = {
  anno: number;
  mese: number;
  nomeFile: string; // MM_Transazioni_<Mese>_<AA>_Q8.xlsx
  intestazione: string[]; // 37 colonne
  righe: Cell[][]; // 35 valori per riga (AMZ e WEEK sono formule)
  iData: number;
  iOra: number;
  iStation: number;
  iImpNoIva: number;
  iImp: number;
  righeExport: number;
  tenute: number;
  scartate: { prefisso: string; n: number }[];
  settimane: number[];
  stazioni: string[];
  /** station → settimana → somma Imp. Scontato no IVA */
  totali: Record<string, Record<number, number>>;
  /** station → totale del mese (somma dei valori grezzi, poi arrotondata) */
  perStation: Record<string, number>;
  totale: number;
  /** station → giorno (1..31) → somma Imp. Scontato (griglia giornaliera del Recap) */
  giornaliero: Record<string, Record<number, number>>;
  nonCensite: { pan: string; identificativo: string; n: number }[];
  perIdentificativo: { pan: string; identificativo: string; station: string; n: number; importo: number }[];
  anomalie: AnomaliaQ8[];
};

const r2 = (x: number) => Math.round(x * 100) / 100;
const num = (v: Cell) => (typeof v === "number" ? v : 0);

export function elaboraQ8(sheets: SheetGrid[], censimento: Carta[]): EsitoQ8 {
  const src = sheets[0];
  const hr = rigaIntestazioneQ8(src);
  if (hr < 0) throw new Error('non è un export Q8 (intestazione con "PAN Carta" e "N. ticket" non trovata)');
  const hdr = rigaTesto(src, hr);
  const ncol = hdr.length;
  const body = src.rows.slice(hr + 1).filter((r) => r && r.some((x) => x !== null && x !== ""));
  const idx = (n: string) => {
    const i = hdr.indexOf(n);
    if (i < 0) throw new Error(`nell'export Q8 manca la colonna "${n}"`);
    return i;
  };
  const iPan = idx("PAN Carta"), iData = idx("Data"), iOra = idx("Ora"), iIdent = idx("Identificativo"), iVeic = idx("Veicolo"), iAut = idx("Codice autista");
  const iImpNoIva = idx("Imp. Scontato no IVA"), iImp = idx("Imp. Scontato");

  const perPan = new Map(censimento.map((c) => [c.pan.trim(), c]));
  const perIdent = new Map<string, Carta>();
  for (const c of [...censimento].sort((a, b) => a.ordine - b.ordine)) {
    const id = (c.identificativo ?? "").trim().toUpperCase();
    if (id && !cartaNonAttribuita(c.ds) && !perIdent.has(id)) perIdent.set(id, c);
  }

  const { anno, mese } = mesePrevalente(body.map((r) => (r[iData] instanceof Date ? (r[iData] as Date) : null)));
  const intestazione = [...hdr];
  intestazione[iVeic] = "STATION";
  intestazione[iAut] = "ASSEGNAZION";
  intestazione.push("AMZ", "WEEK");

  const scartate = new Map<string, number>();
  const nonCens = new Map<string, { pan: string; identificativo: string; n: number }>();
  const perId = new Map<string, { pan: string; identificativo: string; station: string; n: number; importo: number }>();
  const righe: Cell[][] = [];
  for (const r of body) {
    const ident = pyStr(r[iIdent] ?? null).toUpperCase();
    if (!(ident.startsWith("AMZ") || ident.startsWith("GLS"))) {
      const k = ident.slice(0, 3) || "(vuoto)";
      scartate.set(k, (scartate.get(k) ?? 0) + 1);
      continue;
    }
    const pan = pyStr(r[iPan] ?? null);
    const c = perPan.get(pan);
    let st: string;
    if (c && !cartaNonAttribuita(c.ds)) st = c.ds!.trim();
    else if (perIdent.has(ident)) {
      st = perIdent.get(ident)!.ds!.trim();
      const k = `${pan}|${ident}|${st}`;
      const x = perId.get(k) ?? { pan, identificativo: ident, station: st, n: 0, importo: 0 };
      x.n++;
      x.importo += num(r[iImpNoIva] ?? null);
      perId.set(k, x);
    } else {
      st = "NON CENSITA";
      const k = `${pan}|${ident}`;
      const x = nonCens.get(k) ?? { pan, identificativo: ident, n: 0 };
      x.n++;
      nonCens.set(k, x);
    }
    // decimali a 16 cifre significative, come li scrive openpyxl (14.449999999999994 → 14.44999999999999)
    const out = Array.from({ length: ncol }, (_, j) => { const v = r[j] === undefined ? null : r[j]; return (typeof v === "number" && !Number.isInteger(v) ? Number(v.toPrecision(16)) : v) as Cell; });
    out[iVeic] = st;
    out[iAut] = null;
    righe.push(out);
  }

  const settimane = settimaneDelMese(anno, mese);
  const totali: Record<string, Record<number, number>> = {};
  const giornaliero: Record<string, Record<number, number>> = {};
  let totale = 0;
  const perStation: Record<string, number> = {};
  for (const r of righe) {
    const st = r[iVeic] as string;
    const d = r[iData];
    const v = num(r[iImpNoIva]);
    totale += v;
    perStation[st] = (perStation[st] ?? 0) + v;
    totali[st] ??= {};
    giornaliero[st] ??= {};
    if (d instanceof Date) {
      const w = weeknumExcel(d);
      totali[st][w] = (totali[st][w] ?? 0) + v;
      if (d.getUTCFullYear() === anno && d.getUTCMonth() + 1 === mese) giornaliero[st][d.getUTCDate()] = (giornaliero[st][d.getUTCDate()] ?? 0) + num(r[iImp]);
    }
  }
  for (const st of Object.keys(perStation)) perStation[st] = r2(perStation[st]);
  for (const m of [totali, giornaliero]) for (const st of Object.keys(m)) for (const k of Object.keys(m[st])) m[st][+k] = r2(m[st][+k]);

  const sc = [...scartate].map(([prefisso, n]) => ({ prefisso, n })).sort((a, b) => b.n - a.n);
  const nc = [...nonCens.values()].sort((a, b) => b.n - a.n);
  const pi = [...perId.values()].sort((a, b) => b.n - a.n).map((x) => ({ ...x, importo: r2(x.importo) }));
  const anomalie: AnomaliaQ8[] = [
    ...nc.map((x) => ({ tipo: "Carta non nel censimento (o senza DS)", pan: x.pan, identificativo: x.identificativo, n: x.n, nota: "aggiornare il censimento fuel card" })),
    ...pi.map((x) => ({ tipo: "PAN non censito: abbinata per Identificativo", pan: x.pan, identificativo: x.identificativo, n: x.n, nota: `STATION ${x.station} presa dalla carta con lo stesso identificativo (carta riemessa?): aggiungere il nuovo PAN al censimento` })),
    ...sc.map((x) => ({ tipo: "Scartate (Identificativo non AMZ/GLS)", pan: null, identificativo: x.prefisso, n: x.n, nota: "non nostri appalti" })),
  ];
  return {
    anno, mese, nomeFile: `${String(mese).padStart(2, "0")}_Transazioni_${MESI[mese]}_${String(anno).slice(2)}_Q8.xlsx`,
    intestazione, righe, iData, iOra, iStation: iVeic, iImpNoIva, iImp,
    righeExport: body.length, tenute: righe.length, scartate: sc, settimane,
    stazioni: Object.keys(totali).sort(ordinaStation), totali, perStation, totale: r2(totale), giornaliero,
    nonCensite: nc, perIdentificativo: pi, anomalie,
  };
}
