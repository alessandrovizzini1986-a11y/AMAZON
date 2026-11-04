/**
 * Stima STD (Adecco) di competenza del mese dai tracking: ore per voce, quota
 * domenica/festivi, trasferte, voci non da tracking (come Stima_AMZ_*_v2).
 */
import { oreLavoro, type Lavoratore } from "@/domain/presenze/lavoratori";
import { domenicaOFestivo, type Festivo } from "./festivi";
import { trasfertaGiorno, type ValorePerData } from "./tariffe";
import type { TariffeStd } from "./adit";

export type OreStation = {
  station: string; teste: number;
  standard: number; standardDF: number; straord: number; straordDom: number; suppl: number; supplDom: number; accordo: number;
  ferie: number; rol: number; exf: number; malattia: number; infortunio: number; carenzaOre: number;
  trasfGg: number; trasfDom: number; trasfDispatcher: number; trasfEuro: number;
};

const isDom = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay() === 0;
const r2 = (x: number) => Math.round(x * 100) / 100;
export const isDispatcher = (contratto: string) => /DISP|DSP/i.test(contratto);

/**
 * Ore del mese per station. MAGG50 = Standard su domenica o festivo; STR65 /
 * SUPP65 = Straordinario / Supplementare su domenica o festivo; trasferta =
 * giorni con ore lavoro > 4 (domenica = solo domenica), € alla tariffa della data.
 */
export function oreStation(station: string, lavoratori: Lavoratore[], festivi: Festivo[], tariffe: ValorePerData[], opz: { dispatcherTrasferta?: boolean } = {}): OreStation {
  const o: OreStation = { station, teste: 0, standard: 0, standardDF: 0, straord: 0, straordDom: 0, suppl: 0, supplDom: 0, accordo: 0, ferie: 0, rol: 0, exf: 0, malattia: 0, infortunio: 0, carenzaOre: 0, trasfGg: 0, trasfDom: 0, trasfDispatcher: 0, trasfEuro: 0 };
  for (const l of lavoratori) {
    const giorni = Object.keys(l.giorni).sort();
    if (giorni.some((d) => Object.values(l.giorni[d]).some((v) => v))) o.teste++;
    const disp = isDispatcher(l.contratto);
    let inizio: string | null = null, prev: string | null = null;
    for (const d of giorni) {
      const g = l.giorni[d];
      const df = domenicaOFestivo(d, station, festivi);
      o.standard += g.Standard ?? 0; o.straord += g.Straordinario ?? 0; o.suppl += g.Supplementare ?? 0; o.accordo += g.Accordo ?? 0;
      if (df) { o.standardDF += g.Standard ?? 0; o.straordDom += g.Straordinario ?? 0; o.supplDom += g.Supplementare ?? 0; }
      o.ferie += g.FERIE ?? 0; o.rol += g.ROL ?? 0; o.exf += g.ExF ?? 0; o.infortunio += g.INFORTUNIO ?? 0;
      if (g.MALATTIA) {
        o.malattia += g.MALATTIA;
        if (!prev || (Date.parse(d) - Date.parse(prev)) / 864e5 > 1) inizio = d;
        if ((Date.parse(d) - Date.parse(inizio!)) / 864e5 < 3) o.carenzaOre += g.MALATTIA;
        prev = d;
      }
      if (oreLavoro(l, d) > 4) {
        const dom = isDom(d);
        if (disp) o.trasfDispatcher++;
        if (disp && opz.dispatcherTrasferta === false) continue;
        o.trasfGg++; if (dom) o.trasfDom++;
        o.trasfEuro += trasfertaGiorno(tariffe, d, dom);
      }
    }
  }
  for (const k of Object.keys(o) as (keyof OreStation)[]) if (typeof o[k] === "number") (o[k] as number) = r2(o[k] as number);
  return o;
}

export type ParametriStd = { CTRB_H: number; ALTRO_PCT: number; GG_MESE: number; MOG: number };

export type RigaStima = { voce: string; quantita: number | null; tariffa: number | null; importo: number };
export type StimaStdStation = { station: string; righe: RigaStima[]; costoOre: number; trasferte: number; core: number; nonTracking: number; totale: number; /** non arrotondato, per sommare le station */ totaleEsatto: number; nFestivi: number };

/** Costo STD della station: ore × tariffe ADIT + trasferte + voci non da tracking. */
/** `mogEuro`: integrazione MOG della station dal controllo MOG (se assente, il parametro STD_MOG diviso per le station). */
export function stimaStd(o: OreStation, t: TariffeStd, p: ParametriStd, nFestivi: number, nStation = 7, mogEuro?: number): StimaStdStation {
  const ore: [string, number, number][] = [
    ["STANDARD", o.standard - o.standardDF, t.STANDARD], ["STR30", o.straord - o.straordDom, t.STR30], ["SUPP18", o.suppl - o.supplDom, t.SUPP18],
    ["MAGG50", o.standardDF, t.MAGG50], ["STR65", o.straordDom, t.STR65], ["SUPP65", o.supplDom, t.SUPP65],
  ];
  const righe: RigaStima[] = ore.map(([voce, q, tar]) => ({ voce, quantita: r2(q), tariffa: tar, importo: q * tar }));
  const costoOre = righe.reduce((s, r) => s + r.importo, 0);
  righe.push({ voce: "TRASFERTA", quantita: o.trasfGg, tariffa: null, importo: o.trasfEuro });
  const oreFest = (o.standard / p.GG_MESE) * nFestivi;
  const nt: RigaStima[] = [
    { voce: "FESTIVITA", quantita: r2(oreFest), tariffa: t.FESTIVITA, importo: oreFest * t.FESTIVITA },
    { voce: "FERIE_PERM_GOD", quantita: r2(o.ferie + o.rol + o.exf), tariffa: t.FERIE_PERM_GOD, importo: (o.ferie + o.rol + o.exf) * t.FERIE_PERM_GOD },
    { voce: "CARENZA", quantita: null, tariffa: t.CARENZA_PCT, importo: costoOre * t.CARENZA_PCT },
    { voce: "CTRB_DIGNITA", quantita: r2(o.standard + o.straord + o.suppl), tariffa: p.CTRB_H, importo: (o.standard + o.straord + o.suppl) * p.CTRB_H },
    { voce: "ALTRO", quantita: null, tariffa: p.ALTRO_PCT, importo: costoOre * p.ALTRO_PCT },
    { voce: "INTEGR_MOG", quantita: null, tariffa: null, importo: mogEuro ?? p.MOG / nStation },
  ];
  righe.push(...nt);
  const nonTracking = nt.reduce((s, r) => s + r.importo, 0);
  const core = costoOre + o.trasfEuro;
  return { station: o.station, righe: righe.map((r) => ({ ...r, importo: r2(r.importo) })), costoOre: r2(costoOre), trasferte: r2(o.trasfEuro), core: r2(core), nonTracking: r2(nonTracking), totale: r2(core + nonTracking), totaleEsatto: core + nonTracking, nFestivi };
}

/** Totale di più station: somma dei valori non arrotondati, poi arrotondata al centesimo. */
export const totaleStime = (s: Pick<StimaStdStation, "totaleEsatto">[]) => r2(s.reduce((a, x) => a + x.totaleEsatto, 0));
