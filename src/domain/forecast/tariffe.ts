/**
 * Tariffe per (DS, classe rotta) ed extra per rotta dalle ultime N settimane
 * Amazon chiuse (SPEC §7.2).
 */
import { isRotta } from "@/domain/fatture/classifica";
import { chiusa, inizioSettimana } from "./settimane";

export type RigaCalibrazione = { ds: string; data: string; classe: string; quantita: number; avere: number };
export const CLASSI_EXTRA_PREVISTE = ["EXTRA_ABORT", "EXTRA_BONUS", "EXTRA_CARBURANTE", "EXTRA_TRAINING"];

const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 10000) / 10000;

/**
 * Finestra per DS = ultime N settimane chiuse (terminate da almeno 14 giorni)
 * con righe di fatturato per quella DS, prima di `prima` se indicato (backtest).
 */
export function finestra(righe: RigaCalibrazione[], n: number, oggi: string, prima?: string): Record<string, string[]> {
  const per = new Map<string, Set<string>>();
  for (const r of righe) {
    const w = inizioSettimana(r.data);
    if (prima ? w >= prima : !chiusa(w, oggi)) continue;
    if (!per.has(r.ds)) per.set(r.ds, new Set());
    per.get(r.ds)!.add(w);
  }
  return Object.fromEntries([...per].map(([ds, s]) => [ds, [...s].sort().slice(-n)]));
}

export type Tariffa = { ds: string; classe: string; rotte: number; avere: number; tariffa: number };
export type ExtraClasse = { ds: string; classe: string; avere: number; euroPerRotta: number; rotteTotali: number };
export type Calibrazione = {
  settimane: Record<string, string[]>; // DS → settimane (domeniche) usate
  tariffe: Tariffa[];
  extra: ExtraClasse[];
  extraPerRotta: Record<string, number>; // DS → somma delle 4 classi extra previste
  nonPreviste: { ds: string; classe: string; avere: number }[]; // EXTRA_INCENTIVI, EXTRA_ALTRO
  sdMedia: Record<string, { rotte: number; avere: number; perClasse: Record<string, number> }>; // media settimanale SD
  mediaClasse: Record<string, number>; // tariffa media della classe su tutte le DS (per le tariffe stimate)
};

/** Calibrazione sulle righe delle settimane della finestra (per DS). */
export function calibra(righe: RigaCalibrazione[], settimane: Record<string, string[]>): Calibrazione {
  const dentro = righe.filter((r) => settimane[r.ds]?.includes(inizioSettimana(r.data)));
  const acc = new Map<string, { rotte: number; avere: number }>();
  const extraAcc = new Map<string, number>();
  const nonPrev = new Map<string, number>();
  for (const r of dentro) {
    const k = `${r.ds}|${r.classe}`;
    if (isRotta(r.classe)) {
      const x = acc.get(k) ?? { rotte: 0, avere: 0 };
      x.rotte += r.quantita; x.avere += r.avere;
      acc.set(k, x);
    } else if (CLASSI_EXTRA_PREVISTE.includes(r.classe)) extraAcc.set(k, (extraAcc.get(k) ?? 0) + r.avere);
    else nonPrev.set(k, (nonPrev.get(k) ?? 0) + r.avere);
  }
  const tariffe: Tariffa[] = [...acc].map(([k, v]) => { const [ds, classe] = k.split("|"); return { ds, classe, rotte: v.rotte, avere: r2(v.avere), tariffa: r2(v.avere / v.rotte) }; })
    .filter((t) => t.rotte > 0).sort((a, b) => a.ds.localeCompare(b.ds) || a.classe.localeCompare(b.classe));
  const rotteDs: Record<string, number> = {};
  for (const t of tariffe) rotteDs[t.ds] = (rotteDs[t.ds] ?? 0) + t.rotte;
  const extra: ExtraClasse[] = [...extraAcc].map(([k, avere]) => { const [ds, classe] = k.split("|"); return { ds, classe, avere: r2(avere), rotteTotali: rotteDs[ds] ?? 0, euroPerRotta: rotteDs[ds] ? r4(avere / rotteDs[ds]) : 0 }; })
    .sort((a, b) => a.ds.localeCompare(b.ds) || a.classe.localeCompare(b.classe));
  const extraPerRotta: Record<string, number> = {};
  for (const e of extra) extraPerRotta[e.ds] = r4((extraPerRotta[e.ds] ?? 0) + e.euroPerRotta);
  const sdMedia: Calibrazione["sdMedia"] = {};
  for (const t of tariffe.filter((x) => x.classe.startsWith("SD_"))) {
    const n = settimane[t.ds]?.length || 1;
    const m = (sdMedia[t.ds] ??= { rotte: 0, avere: 0, perClasse: {} });
    m.rotte += t.rotte / n; m.avere += t.avere / n; m.perClasse[t.classe] = t.rotte / n;
  }
  for (const m of Object.values(sdMedia)) { m.rotte = Math.round(m.rotte * 1000) / 1000; m.avere = r2(m.avere); }
  const mc = new Map<string, { rotte: number; avere: number }>();
  for (const t of tariffe) { const x = mc.get(t.classe) ?? { rotte: 0, avere: 0 }; x.rotte += t.rotte; x.avere += t.avere; mc.set(t.classe, x); }
  return {
    settimane, tariffe, extra, extraPerRotta,
    nonPreviste: [...nonPrev].map(([k, avere]) => { const [ds, classe] = k.split("|"); return { ds, classe, avere: r2(avere) }; }),
    sdMedia, mediaClasse: Object.fromEntries([...mc].map(([c, v]) => [c, r2(v.avere / v.rotte)])),
  };
}

/** Tariffa per (DS, classe); se manca nella finestra, media della classe sulle altre DS ("tariffa stimata"). */
export function tariffaDi(c: Calibrazione, ds: string, classe: string): { tariffa: number; stimata: boolean } | null {
  const t = c.tariffe.find((x) => x.ds === ds && x.classe === classe);
  if (t) return { tariffa: t.tariffa, stimata: false };
  const altre = c.tariffe.filter((x) => x.classe === classe && x.ds !== ds);
  if (!altre.length) return null;
  const rotte = altre.reduce((s, x) => s + x.rotte, 0), avere = altre.reduce((s, x) => s + x.avere, 0);
  return { tariffa: r2(avere / rotte), stimata: true };
}
