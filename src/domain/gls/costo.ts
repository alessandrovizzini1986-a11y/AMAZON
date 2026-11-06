/**
 * Costo del personale GLS Castel Maggiore (CDC 5565) dal file presenze (docs/costi-kit/PROMPT_GLS_mensile.md §3).
 *
 * SIC — busta pagata il 27 del mese M = CDL (foglio "SIC GLS BO") dei SIC attivi a M + variabili del mese M−1
 * dalla griglia presenze: trasferte (giorni con "Indennità Trasferta" × tariffa alla data, extra la domenica),
 * straordinari × €/h SIC, festività non godute (sabato/domenica a tutti, in settimana solo a chi ha lavorato),
 * malattia −€/h netta della carenza, assenze non pagate (PNR, 104, altri giustificativi) al costo orario,
 * ferie/ROL/ExF godute al saving del CDL. Tutto × oneri tranne la trasferta (esente).
 * Stesse regole e parametri della busta Amazon (bustaLavoratore); verificata su settembre 2026:
 * stima 293.770 € contro payroll CDC 5565 291.633 € (+0,7 %).
 *
 * STD — ore del mese M dalla griglia (persone STD in anagrafica) × tariffe ADIT, con stimaStd.
 */
import type { RigaCDL } from "@/domain/costi/anagrafica";
import type { Festivo } from "@/domain/costi/festivi";
import type { ParametriSic } from "@/domain/costi/sic";
import { stimaStd, type OreStation, type ParametriStd, type StimaStdStation } from "@/domain/costi/std";
import type { TariffeStd } from "@/domain/costi/adit";
import { trasfertaGiorno, type ValorePerData } from "@/domain/costi/tariffe";
import { trovaCDL } from "@/domain/costi/anagrafica";
import { attivoNel, totVoce, type PersonaAnagraficaGls, type PersonaGrigliaGls, type PresenzeGls } from "./presenze";

export const STATION_GLS = "GLS";
export const CDC_GLS = 5565;

const r2 = (x: number) => Math.round(x * 100) / 100;
const isDom = (d: string) => new Date(d + "T12:00:00Z").getUTCDay() === 0;
const isWeekend = (d: string) => { const g = new Date(d + "T12:00:00Z").getUTCDay(); return g === 0 || g === 6; };
const ultimoGiorno = (mese: string) => { const [a, m] = mese.split("-").map(Number); return `${mese}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`; };
export const mesePrecGls = (mese: string) => { const [a, m] = mese.split("-").map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`; };

/** Festivi GLS del mese (nazionali + patrono GLS; i semifestivi non sono festività non godute). */
export const festiviGls = (festivi: Festivo[], mese: string) =>
  [...new Set(festivi.filter((f) => f.data.startsWith(mese) && (f.station === "TUTTE" || f.station === STATION_GLS) && !/semifestiv/i.test(f.descrizione)).map((f) => f.data))].sort();

const lavoraIl = (p: PersonaGrigliaGls | undefined, d: string) => !!p && ((p.voci.Ordinarie?.[d] ?? 0) + (p.voci.Straordinari?.[d] ?? 0) + (p.voci["Straordinari notturni"]?.[d] ?? 0)) > 0;

export type BustaGls = {
  cf: string; nome: string; cdlStimato: boolean; pct: number; dispatcher: boolean;
  base: number; trasferta: number; trasfGg: number; trasfDom: number; straordinari: number; oreStraord: number; festivita: number; festGg: number;
  malattia: number; oreMalattia: number; altreAssenze: number; oreAssenze: number; ferieGodute: number; totale: number;
};
export type RiepilogoBustaGls = Omit<BustaGls, "cf" | "nome" | "cdlStimato" | "pct" | "dispatcher"> & { teste: number; cdlStimati: number };

export type EsitoBustaGls = {
  mese: string; meseVariabili: string; righe: BustaGls[]; totali: RiepilogoBustaGls;
  /** SIC con presenze a M−1 non più attivi a M: busta di chiusura già pagata a M−1 */
  cessati: string[];
  /**
   * SIC attivi senza riga CDL. Assunti nel mese: CDL stimato = CDL medio FT × % contratto × giorni attivi / giorni
   * del mese (contato). Attivi da prima del mese ma assenti dal CDL: non contati, da verificare (anagrafica non
   * aggiornata o persona non in paga).
   */
  senzaCdl: { nome: string; inizio: string | null; pct: number; cdl: number; contato: boolean }[];
};

/**
 * Busta SIC GLS pagata nel mese `mese`. `variabili` = presenze del mese prima; `anagMese` = Anagrafica del file
 * presenze del mese (chi è attivo a `mese`). Cessati a M−1 esclusi.
 */
export function bustaGls(x: { mese: string; variabili: PresenzeGls; anagMese: PersonaAnagraficaGls[]; cdl: RigaCDL[]; par: ParametriSic; tariffe: ValorePerData[]; festivi: Festivo[] }): EsitoBustaGls {
  const { mese, variabili: v, par: p } = x;
  const primo = `${mese}-01`, ultimo = ultimoGiorno(mese), nGg = Number(ultimo.slice(8));
  const idx = new Map(x.cdl.map((r) => [r.cf, r]));
  const ft = x.cdl.filter((r) => { const q = r.pctPt ?? 1; return q === 100 || (q >= 0.99 && q <= 1); });
  const cdlMedioFt = ft.length ? ft.reduce((a, r) => a + r.cdl, 0) / ft.length : 0;
  const griglia = new Map(v.griglia.map((g) => [g.cf, g]));
  const festM1 = festiviGls(x.festivi, v.mese);
  const anag = new Map<string, PersonaAnagraficaGls>();
  for (const a of v.anagrafica) anag.set(a.cf, a);
  for (const a of x.anagMese) anag.set(a.cf, a); // vale l'anagrafica più recente
  const attiviM = new Set(x.anagMese.filter((a) => a.tipo === "SIC" && attivoNel(a, primo, ultimo)).map((a) => a.cf));
  const righe: BustaGls[] = [], cessati: string[] = [], senzaCdl: EsitoBustaGls["senzaCdl"] = [];
  for (const g of v.griglia) {
    const a = anag.get(g.cf);
    if (a?.tipo === "SIC" && !attiviM.has(g.cf)) cessati.push(g.nome || `${a.nome} ${a.cognome}`);
  }
  for (const cf of attiviM) {
    const a = anag.get(cf)!;
    const g = griglia.get(cf);
    const t = trovaCDL(cf, idx);
    const c = t?.riga ?? null;
    const pctRaw = c?.pctPt ?? a.pct ?? 1;
    const pct = pctRaw > 1 ? pctRaw / 100 : pctRaw || 1;
    const nome = g?.nome || `${a.nome} ${a.cognome}`.trim();
    let base = c?.cdl ?? 0;
    if (!c && !(a.inizio && a.inizio >= primo)) { senzaCdl.push({ nome, inizio: a.inizio, pct, cdl: 0, contato: false }); continue; }
    if (!c) {
      const da = a.inizio && a.inizio > primo ? a.inizio : primo, aa = a.fine && a.fine < ultimo ? a.fine : ultimo;
      const gg = Math.max(0, (Date.parse(aa) - Date.parse(da)) / 864e5 + 1);
      base = (cdlMedioFt * pct * gg) / nGg;
      senzaCdl.push({ nome, inizio: a.inizio, pct, cdl: r2(base), contato: true });
    }
    const dispatcher = /disp/i.test(a.mansione) || /disp/i.test(g?.mansione ?? "");
    // trasferte del mese prima
    const tr = g?.voci["Indennità Trasferta"] ?? {};
    let trasferta = 0, trasfGg = 0, trasfDom = 0;
    for (const [d, n] of Object.entries(tr)) { if (!n) continue; const dom = isDom(d); trasfGg++; if (dom) trasfDom++; trasferta += trasfertaGiorno(x.tariffe, d, dom); }
    // straordinari
    const oreStraord = totVoce(g, "Straordinari") + totVoce(g, "Straordinari notturni");
    const strTar = pct >= 0.99 || dispatcher ? p.STR_FT : p.STR_PT;
    // festività non godute del mese prima: weekend a tutti (nel periodo di contratto), in settimana a chi ha lavorato
    const festGg = festM1.filter((d) => (!a.inizio || a.inizio <= d) && (isWeekend(d) || lavoraIl(g, d))).length;
    const festGgEuro = c?.rlm ? (c.rlm * pct) / 22 : (c?.costoFestNonGodutaGg ?? 0) / 1.379;
    const straordLordi = oreStraord * strTar, festLordi = festGg * festGgEuro;
    // assenze
    const oreMalattia = totVoce(g, "MALATTIA");
    const mal = oreMalattia * p.MALATTIA_H * p.MOLT_ONERI;
    const malattia = mal - mal * p.CARENZA_PCT;
    const oreAssenze = totVoce(g, "PNR") + totVoce(g, "PERMESSO L.104") + totVoce(g, "ALTRI GIUSTIFICATIVI");
    const hMese = c?.hSettim ? (c.hSettim * 52) / 12 : a.hSettim ? (a.hSettim * 52) / 12 : null;
    const orarioBase = c?.rlm && hMese ? (c.rlm * pct) / hMese : 0;
    const altreAssenze = -oreAssenze * orarioBase * p.MOLT_ONERI;
    const hGiorno = a.hGiorno || (a.hSettim ? a.hSettim / 5 : 7.8);
    const ferieGodute = c ? -((totVoce(g, "FERIE") / hGiorno) * (c.savingFeGg ?? 0) + totVoce(g, "ROL") * (c.savingRolH ?? 0) + totVoce(g, "EXF") * (c.savingExfH ?? 0)) : 0;
    const straordinari = straordLordi * p.MOLT_ONERI, festivita = festLordi * p.MOLT_ONERI;
    righe.push({
      cf, nome, cdlStimato: !c, pct, dispatcher, base, trasferta, trasfGg, trasfDom, straordinari, oreStraord, festivita, festGg, malattia, oreMalattia, altreAssenze, oreAssenze, ferieGodute,
      totale: base + trasferta + straordinari + festivita + malattia + altreAssenze + ferieGodute,
    });
  }
  const S = (k: keyof RiepilogoBustaGls & keyof BustaGls) => righe.reduce((s, r) => s + (r[k] as number), 0);
  const chiavi = ["base", "trasferta", "trasfGg", "trasfDom", "straordinari", "oreStraord", "festivita", "festGg", "malattia", "oreMalattia", "altreAssenze", "oreAssenze", "ferieGodute", "totale"] as const;
  const totali = { teste: righe.length, cdlStimati: righe.filter((r) => r.cdlStimato).length, ...Object.fromEntries(chiavi.map((k) => [k, r2(S(k))])) } as RiepilogoBustaGls;
  return { mese, meseVariabili: v.mese, righe: righe.sort((a, b) => a.nome.localeCompare(b.nome)), totali, cessati: cessati.sort(), senzaCdl };
}

/**
 * Accantonamenti SIC del mese (righe 60 e 61 del F.O.): straordinari e festività non godute del mese a costo SIC
 * (× oneri) e saving ferie/ROL/ExF godute del mese. Sono le variabili che finiranno nella busta del mese dopo.
 */
export function accantonamentiGls(x: { presenze: PresenzeGls; cdl: RigaCDL[]; par: ParametriSic; festivi: Festivo[] }) {
  const idx = new Map(x.cdl.map((r) => [r.cf, r]));
  const anag = new Map(x.presenze.anagrafica.map((a) => [a.cf, a]));
  const fest = festiviGls(x.festivi, x.presenze.mese);
  let straord = 0, ferie = 0;
  for (const g of x.presenze.griglia) {
    const a = anag.get(g.cf);
    if (a?.tipo !== "SIC") continue;
    const c = trovaCDL(g.cf, idx)?.riga;
    if (!c) continue;
    const pctRaw = c.pctPt ?? a.pct ?? 1, pct = pctRaw > 1 ? pctRaw / 100 : pctRaw || 1;
    const strTar = pct >= 0.99 || /disp/i.test(a.mansione) ? x.par.STR_FT : x.par.STR_PT;
    const festGg = fest.filter((d) => (!a.inizio || a.inizio <= d) && (isWeekend(d) || lavoraIl(g, d))).length;
    const festEuro = c.rlm ? (c.rlm * pct) / 22 : 0;
    straord += ((totVoce(g, "Straordinari") + totVoce(g, "Straordinari notturni")) * strTar + festGg * festEuro) * x.par.MOLT_ONERI;
    const hGiorno = a.hGiorno || 7.8;
    ferie += (totVoce(g, "FERIE") / hGiorno) * (c.savingFeGg ?? 0) + totVoce(g, "ROL") * (c.savingRolH ?? 0) + totVoce(g, "EXF") * (c.savingExfH ?? 0);
  }
  return { straord: r2(straord), ferie: r2(ferie) };
}

export type OreGls = OreStation & { ordinarie: number; notturno: number };

/** Ore del mese di una popolazione (SIC o STD) dalla griglia: MAGG50 / STR65 = ore su domenica o festivo GLS. */
export function oreGls(presenze: PresenzeGls, tipo: "SIC" | "STD", festivi: Festivo[], tariffe: ValorePerData[]): OreGls {
  const fest = new Set(festiviGls(festivi, presenze.mese));
  const anag = new Map(presenze.anagrafica.map((a) => [a.cf, a]));
  const o: OreGls = { station: STATION_GLS, teste: 0, standard: 0, standardDF: 0, straord: 0, straordDom: 0, suppl: 0, supplDom: 0, accordo: 0, ferie: 0, rol: 0, exf: 0, malattia: 0, infortunio: 0, carenzaOre: 0, trasfGg: 0, trasfDom: 0, trasfDispatcher: 0, trasfEuro: 0, ordinarie: 0, notturno: 0 };
  for (const g of presenze.griglia) {
    if (anag.get(g.cf)?.tipo !== tipo) continue;
    if (Object.values(g.voci).some((m) => Object.values(m ?? {}).some((n) => n))) o.teste++;
    for (const d of presenze.giorni) {
      const df = isDom(d) || fest.has(d);
      const ord = g.voci.Ordinarie?.[d] ?? 0, str = (g.voci.Straordinari?.[d] ?? 0) + (g.voci["Straordinari notturni"]?.[d] ?? 0);
      o.standard += ord; o.straord += str;
      if (df) { o.standardDF += ord; o.straordDom += str; }
      if (g.voci["Indennità Trasferta"]?.[d]) { const dom = isDom(d); o.trasfGg++; if (dom) o.trasfDom++; o.trasfEuro += trasfertaGiorno(tariffe, d, dom); }
    }
    o.ferie += totVoce(g, "FERIE"); o.rol += totVoce(g, "ROL"); o.exf += totVoce(g, "EXF"); o.malattia += totVoce(g, "MALATTIA"); o.notturno += totVoce(g, "Notturno");
  }
  o.ordinarie = o.standard;
  for (const k of Object.keys(o) as (keyof OreGls)[]) if (typeof o[k] === "number") (o[k] as number) = r2(o[k] as number);
  return o;
}

/** Stima STD GLS di competenza: ore STD del mese × tariffe ADIT (stessa funzione di Amazon, una sola "station"). */
export function stimaStdGls(o: OreGls, t: TariffeStd, p: ParametriStd, nFestivi: number, mogEuro = 0): StimaStdStation {
  return stimaStd(o, t, p, nFestivi, 1, mogEuro);
}

/** Teste STD per tipo (FT, PT; MOG non è nel file presenze) tra gli STD attivi nel mese. */
export function testeStdGls(anag: PersonaAnagraficaGls[], mese: string) {
  const s = anag.filter((a) => a.tipo === "STD" && attivoNel(a, `${mese}-01`, ultimoGiorno(mese)));
  const ft = s.filter((a) => a.ftPt === "FT" || (a.pct ?? 0) >= 0.99).length;
  return { ft, pt: s.length - ft, mog: 0 };
}
