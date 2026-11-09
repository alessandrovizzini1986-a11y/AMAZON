/**
 * Ricavo previsto dai forecast Amazon (SPEC §7.3) e backtest (§7.4).
 */
import { isRotta } from "@/domain/fatture/classifica";
import { CLASSI_EXTRA_PREVISTE, tariffaDi, type Calibrazione, type RigaCalibrazione } from "./tariffe";
import { giorniSettimana, inizioSettimana, numeroSettimana } from "./settimane";

export type RigaForecast = { data: string; station: string; classe: string; routes: number; fileId?: string; caricatoIl?: string };

/** Per (station, data, classe) vale l'ultimo file caricato: le righe dei file più vecchi per la stessa chiave si ignorano. */
export function ultimoForecast(righe: Required<RigaForecast>[]): RigaForecast[] {
  const best = new Map<string, string>(); // chiave → caricatoIl|fileId vincente
  for (const r of righe) {
    const k = `${r.station}|${r.data}|${r.classe}`;
    const v = `${r.caricatoIl}|${r.fileId}`;
    if (!best.has(k) || v > best.get(k)!) best.set(k, v);
  }
  return righe.filter((r) => best.get(`${r.station}|${r.data}|${r.classe}`) === `${r.caricatoIl}|${r.fileId}`);
}

export type Previsione = {
  ds: string; settimana: string; week: number;
  rotteND: number; rotteSD: number; sdDaMedia: boolean;
  /** forecast solo SD per la settimana (il next-day non arriva così lontano): previsione parziale */
  soloSD: boolean;
  previstoND: number; previstoSD: number; previstoExtra: number; totale: number;
  tariffeStimate: string[]; nonMappate: number;
  /** giorno → importo previsto (per la ripartizione nei mesi) */
  perGiorno: Record<string, number>;
};

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Previsione per DS e settimana dalle righe di forecast (già filtrate con ultimoForecast). */
export function prevedi(forecast: RigaForecast[], cal: Calibrazione): Previsione[] {
  const per = new Map<string, RigaForecast[]>();
  for (const r of forecast) {
    const k = `${r.station}|${inizioSettimana(r.data)}`;
    if (!per.has(k)) per.set(k, []);
    per.get(k)!.push(r);
  }
  const out: Previsione[] = [];
  for (const [k, rs] of per) {
    const [ds, settimana] = k.split("|");
    const epr = cal.extraPerRotta[ds] ?? 0;
    const perGiorno: Record<string, number> = {};
    let rotteND = 0, rotteSD = 0, previstoND = 0, previstoSD = 0, nonMappate = 0;
    const stimate = new Set<string>();
    let haSD = false;
    for (const r of rs) {
      if (!isRotta(r.classe)) { nonMappate += r.routes; continue; }
      const t = tariffaDi(cal, ds, r.classe);
      if (!t) { nonMappate += r.routes; continue; }
      if (t.stimata) stimate.add(r.classe);
      const v = r.routes * t.tariffa;
      if (r.classe.startsWith("SD_")) { haSD = true; rotteSD += r.routes; previstoSD += v; } else { rotteND += r.routes; previstoND += v; }
      perGiorno[r.data] = (perGiorno[r.data] ?? 0) + v + r.routes * epr;
    }
    // nessun forecast SD per la DS ma storico SD: media settimanale delle N settimane, spalmata sui 7 giorni
    const media = cal.sdMedia[ds];
    const sdDaMedia = !haSD && !!media && media.rotte > 0;
    if (sdDaMedia) {
      rotteSD = media.rotte;
      previstoSD = media.avere;
      for (const g of giorniSettimana(settimana)) perGiorno[g] = (perGiorno[g] ?? 0) + (media.avere + media.rotte * epr) / 7;
    }
    const previstoExtra = epr * (rotteND + rotteSD);
    out.push({
      ds, settimana, week: numeroSettimana(settimana), rotteND, rotteSD: Math.round(rotteSD * 10) / 10, sdDaMedia, soloSD: rotteND === 0 && haSD,
      previstoND: r2(previstoND), previstoSD: r2(previstoSD), previstoExtra: r2(previstoExtra), totale: r2(previstoND + previstoSD + previstoExtra),
      tariffeStimate: [...stimate], nonMappate, perGiorno,
    });
  }
  return out.sort((a, b) => a.settimana.localeCompare(b.settimana) || a.ds.localeCompare(b.ds));
}

/** Somma per mese (AAAA-MM) e DS con ripartizione pro-quota sui giorni (escluse le settimane solo SD, parziali). */
export function perMese(p: Previsione[]): Record<string, Record<string, number>> {
  const m: Record<string, Record<string, number>> = {};
  for (const x of p.filter((y) => !y.soloSD)) for (const [g, v] of Object.entries(x.perGiorno)) {
    const mese = g.slice(0, 7);
    (m[mese] ??= {})[x.ds] = r2(((m[mese] ??= {})[x.ds] ?? 0) + v);
  }
  return m;
}

export type Reale = { avere: number; rotte: number; avereND: number; rotteND: number; avereSD: number; rotteSD: number };

/**
 * Fatturato reale comparabile con la previsione: classi rotta + le 4 classi extra previste.
 * Le rotte si contano come nel forecast: next tutte (SWA/MFN comprese); same day ogni giorno A + il maggiore tra B e C
 * (B e C li fa lo stesso furgone). Gli extra si dividono tra next e same in proporzione alle rotte, come nella previsione.
 */
export function reale(righe: RigaCalibrazione[], ds: string, settimana: string): Reale | null {
  const rs = righe.filter((r) => r.ds === ds && inizioSettimana(r.data) === settimana && (isRotta(r.classe) || CLASSI_EXTRA_PREVISTE.includes(r.classe)));
  if (!rs.length) return null;
  const somma = (f: (r: RigaCalibrazione) => boolean, v: (r: RigaCalibrazione) => number) => rs.filter(f).reduce((s, r) => s + v(r), 0);
  const nd = (r: RigaCalibrazione) => r.classe.startsWith("ND_"), sd = (r: RigaCalibrazione) => r.classe.startsWith("SD_");
  const rotteND = somma(nd, (r) => r.quantita);
  const giorni = new Map<string, { a: number; b: number; c: number }>();
  for (const r of rs.filter(sd)) {
    const g = giorni.get(r.data) ?? { a: 0, b: 0, c: 0 };
    if (r.classe === "SD_B") g.b += r.quantita; else if (r.classe === "SD_C") g.c += r.quantita; else g.a += r.quantita;
    giorni.set(r.data, g);
  }
  const rotteSD = [...giorni.values()].reduce((s, g) => s + g.a + Math.max(g.b, g.c), 0);
  const extra = somma((r) => !isRotta(r.classe), (r) => r.avere);
  const quotaND = rotteND + rotteSD ? rotteND / (rotteND + rotteSD) : 1;
  const avereND = somma(nd, (r) => r.avere) + extra * quotaND, avereSD = somma(sd, (r) => r.avere) + extra * (1 - quotaND);
  return { avere: r2(avereND + avereSD), rotte: rotteND + rotteSD, avereND: r2(avereND), rotteND, avereSD: r2(avereSD), rotteSD };
}

export type Backtest = { ds: string; settimana: string; week: number; previsto: number; reale: number; erroreTot: number; rottePreviste: number; rotteFatturate: number; erroreRotte: number };

/** Errore % = (previsto − reale) / reale. */
export function confronta(p: Previsione[], righe: RigaCalibrazione[]): Backtest[] {
  const out: Backtest[] = [];
  for (const x of p) {
    const r = reale(righe, x.ds, x.settimana);
    if (!r) continue;
    const rp = x.rotteND + x.rotteSD;
    out.push({
      ds: x.ds, settimana: x.settimana, week: x.week, previsto: x.totale, reale: r.avere, erroreTot: Math.round(((x.totale - r.avere) / r.avere) * 1000) / 10,
      rottePreviste: Math.round(rp * 10) / 10, rotteFatturate: r.rotte, erroreRotte: r.rotte ? Math.round(((rp - r.rotte) / r.rotte) * 1000) / 10 : 0,
    });
  }
  return out;
}
