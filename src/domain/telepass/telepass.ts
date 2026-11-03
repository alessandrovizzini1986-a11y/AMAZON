/**
 * Export Telepass Business (CSV ";") → righe della tabella Toll, con STATION
 * dalla mappa dispositivi (porting della funzione telepass() dello script).
 */
import { GLS_CM, mesePrevalente, MESI, numIt, ordinaStation, settimaneDelMese, STATION_TELEPASS, weeknumExcel } from "./comune";

export const INTESTAZIONE_TELEPASS = "ID Transazione;ID Codificato;Movimento;";

/** Il testo è un export Telepass? (prima riga, BOM tolto) */
export const isTelepassCsv = (testo: string) => testo.replace(/^﻿/, "").startsWith("ID Transazione;ID Codificato");

/** Valore in uscita: le date sono Date UTC a mezzanotte, gli orari frazioni di giorno (come Excel). */
export type ValToll = string | number | Date | null;

export type AnomaliaTelepass = { tipo: string; chiave: string; n: number; nota: string };

export type EsitoTelepass = {
  anno: number;
  mese: number;
  nomeFile: string; // MM_Telepass_<Mese>_<AAAA>.xlsx
  foglio: string;
  intestazione: string[]; // 36 colonne (Stato → STATION, + WEEK)
  righe: ValToll[][]; // 35 valori per riga (WEEK è una formula)
  iData: number;
  iOra: number;
  iImporto: number;
  iStation: number;
  settimane: number[];
  stazioni: string[];
  /** station → settimana → somma Importo (come la griglia PVT dopo il ricalcolo) */
  totali: Record<string, Record<number, number>>;
  /** station → totale del mese (somma dei valori grezzi, poi arrotondata) */
  perStation: Record<string, number>;
  totale: number;
  nonMappati: { codice: string; n: number }[];
  ricondotti: { codice: string; station: string; n: number; importo: number }[];
  fuoriMese: number;
  anomalie: AnomaliaTelepass[];
};

const NUMERICHE = ["Importo", "Prezzo unitario", "Quantità", "Prezzo", "KM", "Durata"];

function data(s: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return d.getUTCMonth() === +m[2] - 1 ? d : null;
}

function orario(s: string): number | string {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m || +m[1] > 23 || +m[2] > 59 || +m[3] > 59) return s;
  return (+m[1] * 3600 + +m[2] * 60 + +m[3]) / 86400;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * @param tabella righe del CSV già divise (prima riga = intestazione)
 * @param mappa codice dispositivo → station (dalla tabella TelepassDispositivo)
 */
export function elaboraTelepass(tabella: string[][], mappa: Map<string, string>): EsitoTelepass {
  const hdr = tabella[0].map((h, i) => (i === 0 ? h.replace(/^﻿/, "") : h));
  const body = tabella.slice(1).filter((r) => r.some((x) => x !== ""));
  const idx = (n: string) => {
    const i = hdr.indexOf(n);
    if (i < 0) throw new Error(`nel CSV Telepass manca la colonna "${n}"`);
    return i;
  };
  const iData = idx("Data"), iOra = idx("Orario"), iImp = idx("Importo"), iStato = idx("Stato"), iDisp = idx("Codice dispositivo"), iCdc = idx("CDC veicolo");
  const numeriche = new Set(NUMERICHE.map((n) => hdr.indexOf(n)).filter((i) => i >= 0));
  const date = body.map((r) => data(r[iData] ?? ""));
  const { anno, mese } = mesePrevalente(date);
  const intestazione = [...hdr];
  intestazione[iStato] = "STATION";
  intestazione.push("WEEK");

  const nonMappati = new Map<string, number>();
  const ricondotti = new Map<string, { codice: string; station: string; n: number; importo: number }>();
  let fuoriMese = 0;
  const righe: ValToll[][] = [];
  body.forEach((r, k) => {
    const d = date[k];
    if (!d || d.getUTCFullYear() !== anno || d.getUTCMonth() + 1 !== mese) fuoriMese++;
    const disp = (r[iDisp] ?? "").trim();
    let st: string;
    const s0 = mappa.get(disp);
    if (s0 === undefined) {
      st = "NON MAPPATO";
      nonMappati.set(disp, (nonMappati.get(disp) ?? 0) + 1);
    } else if (!STATION_TELEPASS.includes(s0)) {
      // regola confermata il 3/11/2026: STATION non standard (es. VALERIO, VIZZINI) → GLS - CASTEL MAGGIORE
      const kk = `${disp}|${s0}`;
      const x = ricondotti.get(kk) ?? { codice: disp, station: s0, n: 0, importo: 0 };
      x.n++;
      const imp = numIt(r[iImp]);
      if (typeof imp === "number") x.importo += imp;
      ricondotti.set(kk, x);
      st = GLS_CM;
    } else st = s0;
    righe.push(r.map((v, j): ValToll => {
      if (j === iData) return d;
      if (j === iOra) return orario(v);
      if (j === iStato) return st;
      if (numeriche.has(j)) return numIt(v);
      if (j === iDisp || j === iCdc) return /^\d+$/.test(v ?? "") ? Number(v) : v || null;
      return v !== "" ? v : null;
    }));
  });

  const settimane = settimaneDelMese(anno, mese);
  const totali: Record<string, Record<number, number>> = {};
  let totale = 0;
  const perStation: Record<string, number> = {};
  righe.forEach((r) => {
    const st = r[iStato] as string;
    const d = r[iData];
    const imp = typeof r[iImp] === "number" ? (r[iImp] as number) : 0;
    totale += imp;
    perStation[st] = (perStation[st] ?? 0) + imp;
    totali[st] ??= {};
    if (d instanceof Date) { const w = weeknumExcel(d); totali[st][w] = (totali[st][w] ?? 0) + imp; }
  });
  for (const st of Object.keys(perStation)) perStation[st] = r2(perStation[st]);
  for (const st of Object.keys(totali)) for (const w of Object.keys(totali[st])) totali[st][+w] = r2(totali[st][+w]);
  const stazioni = Object.keys(totali).sort(ordinaStation);

  const nm = [...nonMappati].map(([codice, n]) => ({ codice, n })).sort((a, b) => b.n - a.n);
  const ric = [...ricondotti.values()].sort((a, b) => b.n - a.n).map((x) => ({ ...x, importo: r2(x.importo) }));
  const anomalie: AnomaliaTelepass[] = [
    ...nm.map((x) => ({ tipo: "Telepass non in TELEPASS FINALE", chiave: x.codice, n: x.n, nota: "aggiungere il dispositivo in TBusiness_carica_veicoli" })),
    ...ric.map((x) => ({ tipo: "STATION non standard ricondotta a GLS - CASTEL MAGGIORE", chiave: x.codice, n: x.n, nota: `in TELEPASS FINALE STATION = '${x.station}' (regola confermata il 3/11/2026)` })),
    ...(fuoriMese ? [{ tipo: "Righe fuori dal mese prevalente", chiave: "", n: fuoriMese, nota: `mese prevalente ${MESI[mese]} ${anno}` }] : []),
  ];
  const mm = String(mese).padStart(2, "0");
  return {
    anno, mese, nomeFile: `${mm}_Telepass_${MESI[mese]}_${anno}.xlsx`, foglio: `${mm}_Telepass_${MESI[mese]}_${anno}`,
    intestazione, righe, iData, iOra, iImporto: iImp, iStation: iStato, settimane, stazioni, totali, perStation, totale: r2(totale),
    nonMappati: nm, ricondotti: ric, fuoriMese, anomalie,
  };
}

/** Totale per station sul mese. */
export const totaleStation = (e: { perStation: Record<string, number> }, st: string) => e.perStation[st] ?? 0;
