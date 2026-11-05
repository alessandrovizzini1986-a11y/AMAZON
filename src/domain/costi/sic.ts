/**
 * SIC (dipendenti interni): un lavoratore del tracking per riga, unito
 * all'anagrafica CDL per codice fiscale. Due letture:
 * - "lordo" (metodo del file Stima v2): CDL + trasferte + ore × tariffe STD;
 * - "busta 27/M+1": CDL + istituti del mese M + assenze + ferie godute (Parametri SIC).
 */
import { oreLavoro, type Lavoratore } from "@/domain/presenze/lavoratori";
import { domenicaOFestivo, type Festivo } from "./festivi";
import { trasfertaGiorno, type ValorePerData } from "./tariffe";
import { normCf, trovaCDL, type RigaCDL } from "./anagrafica";
import type { TariffeStd } from "./adit";

export type Bucket = "CTI FT" | "CTI PT" | "CTI PT 32h" | "DISPATCHER";
export const BUCKETS: Bucket[] = ["CTI FT", "CTI PT", "CTI PT 32h", "DISPATCHER"];

export function bucket(contratto: string): Bucket {
  const c = contratto.toUpperCase();
  if (c.includes("DISP") || c.trim() === "DSP") return "DISPATCHER";
  if (c.includes("FT")) return "CTI FT";
  if (c.includes("32")) return "CTI PT 32h";
  return "CTI PT";
}

const isDom = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay() === 0;
const isWeekend = (iso: string) => [0, 6].includes(new Date(iso + "T12:00:00Z").getUTCDay());
const fineMese = (iso: string) => { const [a, m] = iso.split("-").map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };
const menoGiorni = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") - n * 864e5).toISOString().slice(0, 10);
const r2 = (x: number) => Math.round(x * 100) / 100;

export type LavoratoreSic = {
  station: string; nome: string; cf: string; contratto: string; bucket: Bucket;
  inAnagrafica: boolean; cfCorretto: boolean; cdl: number; cdlStimato: boolean; anag: RigaCDL | null;
  standard: number; standardDF: number; straord: number; straordDom: number; suppl: number; supplDom: number; accordo: number; oreDomFest: number;
  ferie: number; ggFerie: number; rol: number; exf: number; malattia: number; infortunio: number; nonRetribuite: number;
  /** ore 104 e altri permessi (congedo parentale…): pagate dall'INPS, in busta come assenza */
  permInps: number;
  /** nessuna voce nell'ultima settimana del mese: cessato, non è nella busta del mese dopo */
  cessato: boolean;
  trasfGg: number; trasfDom: number; trasfEuro: number; festiviMese: number; festNonGoduteGg: number;
};

/** Righe DWH_SIC della station: ore per lavoratore, join CDL (esatto, O↔0, poi media del bucket nella station). */
export function lavoratoriSic(station: string, lavoratori: Lavoratore[], anag: Map<string, RigaCDL>, festivi: Festivo[], tariffe: ValorePerData[], festiviDelMese: string[]): LavoratoreSic[] {
  const out: LavoratoreSic[] = [];
  for (const l of lavoratori) {
    const giorni = Object.keys(l.giorni).sort();
    if (!giorni.some((d) => Object.values(l.giorni[d]).some((v) => v))) continue;
    const j = l.cf ? trovaCDL(l.cf, anag) : null;
    const a = j?.riga ?? null;
    const x: LavoratoreSic = {
      station, nome: l.nome, cf: normCf(l.cf), contratto: l.contratto, bucket: bucket(l.contratto), inAnagrafica: !!a, cfCorretto: !!j?.corretto, cdl: a?.cdl ?? 0, cdlStimato: !a, anag: a,
      standard: 0, standardDF: 0, straord: 0, straordDom: 0, suppl: 0, supplDom: 0, accordo: 0, oreDomFest: 0, ferie: 0, ggFerie: 0, rol: 0, exf: 0, malattia: 0, infortunio: 0, nonRetribuite: 0, permInps: 0, cessato: false,
      trasfGg: 0, trasfDom: 0, trasfEuro: 0, festiviMese: festiviDelMese.length, festNonGoduteGg: 0,
    };
    for (const d of giorni) {
      const g = l.giorni[d];
      const df = domenicaOFestivo(d, station, festivi);
      x.standard += g.Standard ?? 0; x.straord += g.Straordinario ?? 0; x.suppl += g.Supplementare ?? 0; x.accordo += g.Accordo ?? 0;
      if (df) { x.standardDF += g.Standard ?? 0; x.straordDom += g.Straordinario ?? 0; x.supplDom += g.Supplementare ?? 0; x.oreDomFest += oreLavoro(l, d); }
      x.ferie += g.FERIE ?? 0; x.rol += g.ROL ?? 0; x.exf += g.ExF ?? 0; x.malattia += g.MALATTIA ?? 0; x.infortunio += g.INFORTUNIO ?? 0;
      x.nonRetribuite += (g.PERM_NR ?? 0) + (g.ASS_INGIUST ?? 0);
      x.permInps += (g["104"] ?? 0) + (g.ALTRI_PERM ?? 0);
      if (oreLavoro(l, d) > 4) { const dom = isDom(d); x.trasfGg++; if (dom) x.trasfDom++; x.trasfEuro += trasfertaGiorno(tariffe, d, dom); }
    }
    // festività non goduta (paga 09/2026 e istituti 04–06/2026): festivo di sabato o domenica a tutti i presenti
    // nel mese, festivo infrasettimanale a chi l'ha lavorato
    const attivi = giorni.filter((d) => Object.values(l.giorni[d]).some((v) => v));
    const primo = attivi[0] ?? "", ultimo = attivi.at(-1) ?? "";
    x.festNonGoduteGg = festiviDelMese.filter((d) => d >= primo && d <= ultimo && (isWeekend(d) || oreLavoro(l, d) > 0)).length;
    x.cessato = !!ultimo && ultimo < menoGiorni(fineMese(ultimo), 6);
    const hGg = a?.hSettim && a?.ggLavorativi ? a.hSettim / a.ggLavorativi : null;
    x.ggFerie = hGg ? x.ferie / hGg : 0;
    out.push(x);
  }
  // CDL mancante = media del bucket nella station
  for (const x of out.filter((y) => !y.inAnagrafica)) {
    const noti = out.filter((y) => y.inAnagrafica && y.bucket === x.bucket);
    x.cdl = noti.length ? noti.reduce((s, y) => s + y.cdl, 0) / noti.length : 0;
  }
  return out;
}

export type SicLordo = { station: string; teste: number; senzaCdl: number; cdl: number; trasferte: number; ore: number; lordo: number; savingRatei: number; festNonGodute: number; accordo: number; trasfDispatcherGg: number; perBucket: Record<Bucket, { teste: number; cdl: number }> };

/** SIC lordo (metodo Stima v2): CDL + trasferte (dispatcher compresi se dispatcherTrasferta) + ore × tariffe STD. */
export function sicLordo(station: string, l: LavoratoreSic[], t: TariffeStd, opz: { dispatcherTrasferta: boolean }): SicLordo {
  const S = (f: (x: LavoratoreSic) => number, xs = l) => xs.reduce((s, x) => s + f(x), 0);
  const perBucket = Object.fromEntries(BUCKETS.map((b) => [b, { teste: l.filter((x) => x.bucket === b).length, cdl: S((x) => x.cdl, l.filter((x) => x.bucket === b)) }])) as SicLordo["perBucket"];
  const trasf = l.filter((x) => opz.dispatcherTrasferta || x.bucket !== "DISPATCHER");
  const ore = S((x) => (x.straord - x.straordDom) * t.STR30 + (x.suppl - x.supplDom) * t.SUPP18 + x.standardDF * t.MAGG50 + x.straordDom * t.STR65 + x.supplDom * t.SUPP65);
  const cdl = S((x) => x.cdl), trasferte = S((x) => x.trasfEuro, trasf);
  const saving = S((x) => (x.anag ? x.ggFerie * (x.anag.savingFeGg ?? 0) + x.rol * (x.anag.savingRolH ?? 0) + x.exf * (x.anag.savingExfH ?? 0) : 0));
  const fest = S((x) => x.festiviMese * (x.anag?.costoFestNonGodutaGg ?? 0));
  return {
    station, teste: l.length, senzaCdl: l.filter((x) => !x.inAnagrafica).length, cdl: r2(cdl), trasferte: r2(trasferte), ore: r2(ore), lordo: r2(cdl + trasferte + ore),
    savingRatei: r2(saving), festNonGodute: r2(fest), accordo: r2(S((x) => x.accordo)), trasfDispatcherGg: S((x) => (x.bucket === "DISPATCHER" ? x.trasfGg : 0)), perBucket,
  };
}

export type ParametriSic = { MOLT_ONERI: number; STR_FT: number; STR_PT: number; SUPP: number; DOMFEST: number; MALATTIA_H: number; CARENZA_PCT: number };

export type BustaLavoratore = { base: number; trasferta: number; istitutiLordi: number; istituti: number; assenze: number; ferieGodute: number; totale: number };

/**
 * Busta 27/M+1 del lavoratore: base CDL + istituti di M (trasferta esente ×1, gli
 * altri lordi × moltiplicatore oneri) + assenze (malattia/infortunio, non
 * retribuite) − ferie/ROL/ExF godute. Dispatcher: nessuna trasferta.
 */
export function bustaLavoratore(x: LavoratoreSic, p: ParametriSic): BustaLavoratore {
  // cessato nel mese: tutto (variabili comprese) è nella busta di chiusura dello stesso mese
  if (x.cessato) return { base: 0, trasferta: 0, istitutiLordi: 0, istituti: 0, assenze: 0, ferieGodute: 0, totale: 0 };
  const a = x.anag;
  const pct = a?.pctPt ? (a.pctPt > 1 ? a.pctPt / 100 : a.pctPt) : 1;
  const trasferta = x.bucket === "DISPATCHER" ? 0 : x.trasfEuro;
  const strTar = x.bucket === "CTI FT" || x.bucket === "DISPATCHER" ? p.STR_FT : p.STR_PT;
  // festività non goduta lorda = RLM × %PT / 22 (paga 09/2026); il costo dell'anagrafica ha già INPS/INAIL
  const festGg = a?.rlm ? (a.rlm * pct) / 22 : (a?.costoFestNonGodutaGg ?? 0) / 1.379;
  const lordi = x.straord * strTar + x.suppl * p.SUPP + x.oreDomFest * p.DOMFEST + x.festNonGoduteGg * festGg;
  const mal = (x.malattia + x.infortunio) * p.MALATTIA_H * p.MOLT_ONERI;
  const carenza = -mal * p.CARENZA_PCT;
  const hMese = a?.hSettim ? (a.hSettim * 52) / 12 : null;
  // RLM è a tempo pieno, le ore settimanali sono quelle del contratto (PT comprese)
  const orarioBase = a?.rlm && hMese ? (a.rlm * pct) / hMese : 0;
  const nonRetr = -(x.nonRetribuite + x.permInps) * orarioBase * p.MOLT_ONERI;
  const ferie = a ? -(x.ggFerie * (a.savingFeGg ?? 0) + x.rol * (a.savingRolH ?? 0) + x.exf * (a.savingExfH ?? 0)) : 0;
  const istituti = trasferta + lordi * p.MOLT_ONERI;
  const assenze = mal + carenza + nonRetr;
  return { base: x.cdl, trasferta, istitutiLordi: lordi, istituti, assenze, ferieGodute: ferie, totale: x.cdl + istituti + assenze + ferie };
}

export type BustaStation = { station: string; teste: number; cdlStimati: number; base: number; trasferte: number; istituti: number; assenze: number; ferieGodute: number; totale: number; totaleEsatto: number };

export function bustaStation(station: string, l: LavoratoreSic[], p: ParametriSic): BustaStation {
  const b = l.map((x) => bustaLavoratore(x, p));
  const S = (f: (y: BustaLavoratore) => number) => b.reduce((s, y) => s + f(y), 0);
  const tot = S((y) => y.totale);
  return { station, teste: l.length, cdlStimati: l.filter((x) => x.cdlStimato).length, base: r2(S((y) => y.base)), trasferte: r2(S((y) => y.trasferta)), istituti: r2(S((y) => y.istituti)), assenze: r2(S((y) => y.assenze)), ferieGodute: r2(S((y) => y.ferieGodute)), totale: r2(tot), totaleEsatto: tot };
}
