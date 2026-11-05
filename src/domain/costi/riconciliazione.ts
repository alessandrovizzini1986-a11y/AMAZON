/** Riconciliazione stima ↔ consuntivo e ricalcolo dei coefficienti dal payroll. */
import type { Componente } from "./payroll";

export type Colore = "verde" | "giallo" | "rosso" | "neutro";
export const colore = (stima: number, cons: number): Colore => {
  if (!cons) return stima ? "rosso" : "neutro";
  const p = Math.abs((stima - cons) / cons);
  return p <= 0.05 ? "verde" : p <= 0.15 ? "giallo" : "rosso";
};
const r2 = (x: number) => Math.round(x * 100) / 100;

export const VOCI_ORE_STD = ["STANDARD", "MAGG50", "STR30", "STR65", "SUPP18"] as const;
const NON_TRACKING = ["FESTIVITA", "FERIE_PERM_GOD", "CARENZA", "CTRB_DIGNITA", "ALTRO", "INTEGR_MOG"];

export type RigaStimaSalvata = { station: string; voce: string; quantita: number | null; importo: number };
export type RigaAditAgg = { station: string; voce: string; quantita: number; costo: number; residuo: boolean };
export type RigaRic = { station: string; voce: string; oreStima: number | null; oreCons: number | null; stima: number; consuntivo: number; delta: number; colore: Colore };

/**
 * STD: stima di competenza M vs ADIT M per station × voce (SUPP65 confluisce in
 * STR65, come in fattura); residui di altri mesi a parte. Il delta della station
 * è scomposto in tariffe / ore / trasferte / voci non da tracking / voci non modellate / residui.
 */
export function riconciliaStd(stima: RigaStimaSalvata[], adit: RigaAditAgg[]) {
  const stations = [...new Set([...stima.map((r) => r.station), ...adit.map((r) => r.station)])].filter((s) => s && s !== "TOTALE").sort();
  const righe: RigaRic[] = [];
  const sintesi: { station: string; stima: number; consuntivo: number; delta: number; tariffe: number; ore: number; trasferte: number; nonTracking: number; nonModellate: number; residui: number; colore: Colore }[] = [];
  for (const st of stations) {
    const s = stima.filter((r) => r.station === st), a = adit.filter((r) => r.station === st && !r.residuo);
    const sv = (v: string) => s.filter((r) => r.voce === v || (v === "STR65" && r.voce === "SUPP65"));
    const av = (v: string) => a.filter((r) => r.voce === v);
    const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);
    let tariffe = 0, ore = 0;
    const voci = ["STANDARD", "MAGG50", "STR30", "STR65", "SUPP18", "TRASFERTA", ...NON_TRACKING];
    for (const v of voci) {
      const hs = sum(sv(v), (r) => r.quantita ?? 0), es = sum(sv(v), (r) => r.importo), hc = sum(av(v), (r) => r.quantita), ec = sum(av(v), (r) => r.costo);
      if (!es && !ec) continue;
      const oreVoce = (VOCI_ORE_STD as readonly string[]).includes(v);
      righe.push({ station: st, voce: v, oreStima: oreVoce || v === "TRASFERTA" ? r2(hs) : null, oreCons: oreVoce || v === "TRASFERTA" ? r2(hc) : null, stima: r2(es), consuntivo: r2(ec), delta: r2(es - ec), colore: colore(es, ec) });
      if (oreVoce) {
        const tc = hc ? ec / hc : 0;
        ore += (hs - hc) * tc; tariffe += es - hs * tc;
      }
    }
    const nm = a.filter((r) => !voci.includes(r.voce));
    for (const v of [...new Set(nm.map((r) => r.voce))]) { const ec = sum(nm.filter((r) => r.voce === v), (r) => r.costo); righe.push({ station: st, voce: v, oreStima: null, oreCons: null, stima: 0, consuntivo: r2(ec), delta: r2(-ec), colore: "rosso" }); }
    const residui = sum(adit.filter((r) => r.station === st && r.residuo), (r) => r.costo);
    const S = sum(s.filter((r) => r.voce === "TOTALE"), (r) => r.importo), C = sum(adit.filter((r) => r.station === st), (r) => r.costo);
    const tr = righe.filter((r) => r.station === st && r.voce === "TRASFERTA").reduce((t, r) => t + r.delta, 0);
    const nt = righe.filter((r) => r.station === st && NON_TRACKING.includes(r.voce)).reduce((t, r) => t + r.delta, 0);
    sintesi.push({ station: st, stima: r2(S), consuntivo: r2(C), delta: r2(S - C), tariffe: r2(tariffe), ore: r2(ore), trasferte: r2(tr), nonTracking: r2(nt), nonModellate: r2(-sum(nm, (r) => r.costo)), residui: r2(-residui), colore: colore(S, C) });
  }
  return { righe, sintesi };
}

export type CompStation = Partial<Record<Componente, number>> & { TOTALE: number; dipendenti: number };

/**
 * SIC: stima busta (tracking M) vs payroll M+1 per station. Il totale è scomposto
 * in trasferta, altri istituti (STR/SUPP/MAGG/festività × moltiplicatore), assenze
 * (assenze + carenza × moltiplicatore) e resto (base CDL − ferie godute ↔ base, oneri, ratei, TFR).
 */
export function riconciliaSic(stima: RigaStimaSalvata[], payroll: Record<string, CompStation>, molt: number) {
  const stations = [...new Set([...stima.map((r) => r.station), ...Object.keys(payroll)])].sort();
  return stations.map((st) => {
    const g = (v: string) => stima.filter((r) => r.station === st && r.voce === v).reduce((t, r) => t + r.importo, 0);
    const p = payroll[st] ?? { TOTALE: 0, dipendenti: 0 };
    const c = (k: Componente) => p[k] ?? 0;
    const voci = [
      { voce: "TRASFERTA", stima: g("TRASFERTA"), consuntivo: c("TRASFERTA") },
      { voce: "ALTRI ISTITUTI", stima: g("ISTITUTI") - g("TRASFERTA"), consuntivo: (c("STR_SUPP_MAGG") + c("FESTIVITA")) * molt },
      { voce: "ASSENZE", stima: g("ASSENZE"), consuntivo: (c("ASSENZE") + c("CARENZA_INTEGR")) * molt },
    ];
    const tot = { voce: "TOTALE", stima: g("TOTALE"), consuntivo: p.TOTALE };
    const resto = { voce: "BASE, ONERI, RATEI, TFR, ALTRO", stima: tot.stima - voci.reduce((t, v) => t + v.stima, 0), consuntivo: tot.consuntivo - voci.reduce((t, v) => t + v.consuntivo, 0) };
    return { station: st, teste: stima.find((r) => r.station === st && r.voce === "TESTE")?.quantita ?? null, dipendenti: p.dipendenti, righe: [...voci, resto, tot].map((v) => ({ ...v, stima: r2(v.stima), consuntivo: r2(v.consuntivo), delta: r2(v.stima - v.consuntivo), colore: colore(v.stima, v.consuntivo) })) };
  });
}

/** Ore SIC del mese di tracking (salvate con la stima) per il ricalcolo dei €/h. */
export type OreSic = { strFt: number; strPt: number; supp: number; domFest: number; malattia: number };
/** € payroll del mese di paga per istituto (dipendenti abbinati all'anagrafica, per gruppo di tariffa). */
export type EuroPayroll = { strFt: number; strPt: number; supp: number; magg: number; malattia: number; carenza: number; oneri: number; tfr: number; imponibile: number };

/** Coefficienti di un mese: €/h = € payroll M+1 / ore tracking M; moltiplicatore = 1 + (oneri + TFR) / imponibile (retribuzione + assenze + istituti). */
export function coefficientiMese(e: EuroPayroll, o: OreSic | null): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {};
  if (e.imponibile) out.SIC_MOLT_ONERI = 1 + (e.oneri + e.tfr) / e.imponibile;
  // carenza/integrazione in % della trattenuta malattia (paga 09/2026: 23.625 / 37.224 = 63,5 %)
  if (e.malattia < 0 && e.carenza) out.SIC_CARENZA_PCT = e.carenza / -e.malattia;
  if (o) {
    if (o.strFt) out.SIC_STR_FT = e.strFt / o.strFt;
    if (o.strPt) out.SIC_STR_PT = e.strPt / o.strPt;
    if (o.supp) out.SIC_SUPP = e.supp / o.supp;
    if (o.domFest) out.SIC_DOMFEST = e.magg / o.domFest;
    if (o.malattia) out.SIC_MALATTIA_H = e.malattia / o.malattia;
  }
  return out;
}

/** Media mobile degli ultimi (fino a) 3 mesi disponibili per chiave, arrotondata. */
export function mediaMobile(mesi: Partial<Record<string, number>>[]): Record<string, number> {
  const out: Record<string, number> = {};
  const chiavi = [...new Set(mesi.flatMap((m) => Object.keys(m)))];
  for (const k of chiavi) {
    const v = mesi.slice(-3).map((m) => m[k]).filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    if (v.length) out[k] = Math.round((v.reduce((a, x) => a + x, 0) / v.length) * 10000) / 10000;
  }
  return out;
}
