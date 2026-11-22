/**
 * Stima costi di metà mese (file "Stima Costi", un foglio per mese): ore per categoria fino al giorno
 * della stima, per station (SIC e STD) e per GLS, poi proiezione sul mese intero (totale / giorno × giorni del mese).
 * Regole: Maggiorazione 50% = Standard di domenica o festivo (patrono compreso); se il festivo infrasettimanale
 * è lavorato come 6° giorno della settimana quelle ore vanno al 65% (Supplementari 65% per i part time,
 * Straordinari 65% per i full time).
 */
import { oreLavoro, type Lavoratore } from "@/domain/presenze/lavoratori";
import type { PresenzeGls } from "@/domain/gls/presenze";
import { oreGls, trasfertaGls } from "@/domain/gls/costo";
import { domenicaOFestivo, type Festivo } from "./festivi";
import { oreStation } from "./std";
import { valoreAlla, type ValorePerData } from "./tariffe";

/** dove sta il file storico in cui va copiato il foglio del mese (cartella condivisa di Teams / OneDrive) */
export const PERCORSO_FILE_STIMA = ["Adecco", "IT_Amazon Last Mile - General", "01. Costi", "Costi", "04_Costo personale", "Stima costi Annalisa"];
export const NOME_FILE_STIMA = "Stima Costi_.xlsx";
/** dove sta il file presenze GLS: serve solo quello "Delivery" (il "Magazzino" per ora no) */
export const PERCORSO_PRESENZE_GLS = ["Adecco", "IT_ADECCO-Outsourcing_OPS-Industrial-Logistic - GLS - CASTEL MAGGIORE", "04-PRESENZE"];
const MESI_FILE = ["GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO", "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE"];
export const nomePresenzeGls = (mese: string) => `GLS Castel Maggiore - Presenze ${MESI_FILE[Number(mese.slice(5, 7)) - 1]}_${mese.slice(0, 4)}_Delivery`;

export const VOCI_META = ["standard", "magg50", "supp18", "supp65", "str30", "str65", "trasfOrd", "trasfDom", "assenzeGg", "malattiaGg", "infortuni", "eventi"] as const;
export type VoceMeta = (typeof VOCI_META)[number];
export type OreMeta = Record<VoceMeta, number>;

export const ETICHETTE_META: Record<VoceMeta, string> = {
  standard: "STANDARD", magg50: "MAGGIORAZIONE 50%", supp18: "SUPPLEMENTARI 18%", supp65: "SUPPLEMENTARI 65%", str30: "STRAORDINARI SETT 30%", str65: "STRAORDINARI DOMENICALI 65%",
  trasfOrd: "TRASFERTE ORD", trasfDom: "TRASFERTE DOM", assenzeGg: "FERIE, ROL, ExFest (hh tot/8)", malattiaGg: "Malattie (hh tot/8)", infortuni: "Infortuni (ore)", eventi: "Eventi mat (teste)",
};
/** le 8 voci che hanno un costo (righe 3–10 del foglio) */
export const VOCI_COSTO = ["standard", "magg50", "supp18", "supp65", "str30", "str65", "trasfOrd", "trasfDom"] as const;
export type VoceCosto = (typeof VOCI_COSTO)[number];
/** costo orario di partenza delle 6 voci a ore (come nel foglio di ottobre 2026); le trasferte vengono dalle tariffe del sito */
export const COSTO_ORA_BASE = { standard: 20.88, magg50: 28.56, supp18: 18.25, supp65: 25.52, str30: 20.11, str65: 25.52 } as const;
export type CostiOra = Record<VoceCosto, number> & { trasfGls: number };

const r2 = (x: number) => Math.round(x * 100) / 100;
const isDom = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay() === 0;
const piu = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lunedi = (iso: string) => piu(iso, -((new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7));
const partTime = (contratto: string) => /\bPT\b|PART|MOG|\b(1[0-9]|2[0-9]|3[0-8])\s*(H|ORE)\b/i.test(contratto);
export const vuote = (): OreMeta => Object.fromEntries(VOCI_META.map((v) => [v, 0])) as OreMeta;

export const giorniDelMese = (mese: string) => new Date(Date.UTC(Number(mese.slice(0, 4)), Number(mese.slice(5, 7)), 0)).getUTCDate();

/**
 * Ore di una station dal 1° al giorno `finoA` (AAAA-MM-GG). `lavoratori` può contenere anche i giorni di altri mesi
 * (letti con tuttiIGiorni): servono solo a contare i giorni lavorati della settimana.
 */
export function oreMetaStation(station: string, lavoratori: Lavoratore[], festivi: Festivo[], tariffe: ValorePerData[], x: { mese: string; finoA: string; dispatcherTrasferta?: boolean }): { ore: OreMeta; sestoFestivo: number } {
  const dentro = (d: string) => d.startsWith(x.mese) && d <= x.finoA;
  const tagliati = lavoratori.map((l) => ({ ...l, giorni: Object.fromEntries(Object.entries(l.giorni).filter(([d]) => dentro(d))) }));
  const o = oreStation(station, tagliati, festivi, tariffe, { dispatcherTrasferta: x.dispatcherTrasferta });
  // festivo infrasettimanale lavorato come 6° giorno: lo Standard di quel giorno passa dal 50% al 65%
  let aSupp = 0, aStr = 0;
  for (const l of lavoratori) for (const [d, g] of Object.entries(l.giorni)) {
    if (!dentro(d) || !g.Standard || isDom(d) || !domenicaOFestivo(d, station, festivi)) continue;
    const lun = lunedi(d);
    let lavorati = 0;
    for (let i = 0; i < 7; i++) if (oreLavoro(l, piu(lun, i)) > 0) lavorati++;
    if (lavorati >= 6) { if (partTime(l.contratto)) aSupp += g.Standard; else aStr += g.Standard; }
  }
  const ore: OreMeta = {
    standard: o.standard - o.standardDF, magg50: o.standardDF - aSupp - aStr, supp18: o.suppl - o.supplDom, supp65: o.supplDom + aSupp, str30: o.straord - o.straordDom, str65: o.straordDom + aStr,
    trasfOrd: o.trasfGg - o.trasfDom, trasfDom: o.trasfDom, assenzeGg: (o.ferie + o.rol + o.exf) / 8, malattiaGg: o.malattia / 8, infortuni: o.infortunio, eventi: 0,
  };
  for (const k of VOCI_META) ore[k] = r2(ore[k]);
  return { ore, sestoFestivo: r2(aSupp + aStr) };
}

/** Ore GLS (dipendenti SIC o somministrati STD) dal 1° al giorno `finoA`, dal file presenze GLS. */
export function oreMetaGls(presenze: PresenzeGls, tipo: "SIC" | "STD", festivi: Festivo[], tariffe: ValorePerData[], finoA: string): OreMeta {
  const p: PresenzeGls = {
    ...presenze, giorni: presenze.giorni.filter((d) => d <= finoA),
    griglia: presenze.griglia.map((g) => ({ ...g, voci: Object.fromEntries(Object.entries(g.voci).map(([k, m]) => [k, Object.fromEntries(Object.entries(m ?? {}).filter(([d]) => d <= finoA))])) })),
  };
  const o = oreGls(p, tipo, festivi, tariffe);
  const ore: OreMeta = {
    standard: o.standard - o.standardDF, magg50: o.standardDF, supp18: 0, supp65: 0, str30: o.straord - o.straordDom, str65: o.straordDom,
    trasfOrd: o.trasfGg - o.trasfDom, trasfDom: o.trasfDom, assenzeGg: (o.ferie + o.rol + o.exf) / 8, malattiaGg: o.malattia / 8, infortuni: 0, eventi: 0,
  };
  for (const k of VOCI_META) ore[k] = r2(ore[k]);
  return ore;
}

/** Costi orari di partenza: le 6 voci a ore dal foglio, le trasferte dalle tariffe del sito alla data. */
export function costiOraBase(tariffe: ValorePerData[], data: string): CostiOra {
  const t = valoreAlla(tariffe, "TRASFERTA", data) ?? 22.5, ex = valoreAlla(tariffe, "TRASFERTA_DOM_EXTRA", data) ?? 7;
  return { ...COSTO_ORA_BASE, trasfOrd: t, trasfDom: r2(t + ex), trasfGls: trasfertaGls(tariffe, data) };
}

export type StimaMeta = {
  mese: string; giorno: number; giorniMese: number; costi: CostiOra;
  sic: Record<string, OreMeta>; std: Record<string, OreMeta>; glsSic: OreMeta | null; glsStd: OreMeta | null;
};

const somma = (per: Record<string, OreMeta>, v: VoceMeta) => Object.values(per).reduce((a, o) => a + o[v], 0);
const costoGls = (o: OreMeta | null, c: CostiOra) => (o ? VOCI_COSTO.reduce((a, v) => a + o[v] * (v === "trasfOrd" || v === "trasfDom" ? c.trasfGls : c[v]), 0) : 0);

/**
 * I totali del foglio, con le sue stesse formule: SIC = voci variabili (dalla Maggiorazione 50% alle trasferte, senza lo Standard
 * che è lo stipendio fisso), STD = tutte le 8 voci, GLS = dipendenti + somministrati. Proiezione = totale / giorno × giorni del mese;
 * "per quattro terzi" = proiezione / 3 × 4 (come nel file).
 */
export function totaliMeta(s: StimaMeta) {
  const pro = (tot: number) => { const mese = (tot / s.giorno) * s.giorniMese; return { alGiorno: r2(tot), mese: r2(mese), quattroTerzi: r2((mese / 3) * 4) }; };
  const sic = VOCI_COSTO.filter((v) => v !== "standard").reduce((a, v) => a + somma(s.sic, v) * s.costi[v], 0);
  const std = VOCI_COSTO.reduce((a, v) => a + somma(s.std, v) * s.costi[v], 0);
  const gls = costoGls(s.glsSic, s.costi) + costoGls(s.glsStd, s.costi);
  return { sic: pro(sic), std: pro(std), gls: pro(gls), glsSic: r2(costoGls(s.glsSic, s.costi)), glsStd: r2(costoGls(s.glsStd, s.costi)) };
}
