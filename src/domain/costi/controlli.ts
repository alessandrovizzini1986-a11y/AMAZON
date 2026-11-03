/** Controlli di fine mese sui tracking (prima di calcolare i costi). */
import { at, type SheetGrid } from "@/domain/presenze/grid";
import { findTrackingSheet } from "@/domain/presenze/tracking";
import { LAVORO, normVoce, type Lavoratore } from "@/domain/presenze/lavoratori";
import { valoreAlla, type ValorePerData } from "./tariffe";
import type { OreStation } from "./std";
import type { AggregatoAdit } from "./adit";

const num = (v: unknown) => (typeof v === "number" ? v : null);

/** Ore lavoro lette dal parser vs somma della riga "Totali" del file nei giorni del mese; celle "Indennità trasferta" senza formula. */
export function letturaFile(sheets: SheetGrid[], anno: number, mese: number) {
  const ts = findTrackingSheet(sheets, anno, mese);
  const prefix = `${anno}-${String(mese).padStart(2, "0")}-`;
  const days = ts.dayCols.filter((d) => d.date.startsWith(prefix));
  let totali = 0, trasfAMano = 0;
  for (let r = ts.headerRow + 1; r < ts.grid.rows.length; r++) {
    const v = normVoce(at(ts.grid, r, ts.tipoCol));
    if (v !== "Totali" && v !== "TRASFERTA") continue;
    for (const { col } of days) {
      const x = num(at(ts.grid, r, col));
      if (x === null || !x) continue;
      if (v === "Totali" && x <= 24) totali += x;
      if (v === "TRASFERTA" && !ts.grid.formulas.has(`${r}:${col}`)) trasfAMano++;
    }
  }
  return { foglio: ts.grid.name, giorni: days.length, totali: Math.round(totali * 100) / 100, trasfAMano };
}

/** Settimane (lun–dom) in cui Standard + Accordo supera il tetto CCNL valido alla domenica della settimana. */
export function sforamentiTetto(lavoratori: Lavoratore[], parametri: ValorePerData[]) {
  const out: { nome: string; settimana: string; ore: number; tetto: number }[] = [];
  for (const l of lavoratori) {
    const sett = new Map<string, number>();
    for (const [d, g] of Object.entries(l.giorni)) {
      const dt = new Date(d + "T12:00:00Z");
      const dom = new Date(dt.getTime() + ((7 - dt.getUTCDay()) % 7) * 864e5).toISOString().slice(0, 10);
      sett.set(dom, (sett.get(dom) ?? 0) + (g.Standard ?? 0) + (g.Accordo ?? 0));
    }
    for (const [dom, ore] of sett) {
      const tetto = valoreAlla(parametri, "TETTO_SETT_H", dom);
      if (tetto !== null && ore > tetto + 0.01) out.push({ nome: l.nome, settimana: dom, ore: Math.round(ore * 100) / 100, tetto });
    }
  }
  return out;
}

/** R4 (solo STD): ore in riga Accordo di domenica. */
export function accordoDomenica(lavoratori: Lavoratore[]) {
  const out: { nome: string; data: string; ore: number }[] = [];
  for (const l of lavoratori) for (const [d, g] of Object.entries(l.giorni)) if (g.Accordo && new Date(d + "T12:00:00Z").getUTCDay() === 0) out.push({ nome: l.nome, data: d, ore: g.Accordo });
  return out;
}

/** Giorni con più di 10 ore lavorate (R2). */
export function giorniOltre10(lavoratori: Lavoratore[]) {
  let n = 0;
  for (const l of lavoratori) for (const g of Object.values(l.giorni)) if (LAVORO.reduce((s, v) => s + (g[v] ?? 0), 0) > 10) n++;
  return n;
}

export type Rapporto = { voce: string; stima: number; riferimento: number; rapporto: number | null; rosso: boolean };

/** Ore stima / ore ADIT per voce (fuori 0,85–1,15 = rosso) e teste tracking / teste ADIT. */
export function rapportiAdit(o: OreStation, adit: AggregatoAdit[string] | undefined): Rapporto[] {
  const q = (v: string) => (adit as Record<string, { quantita: number; teste: number }> | undefined)?.[v];
  const r = (voce: string, stima: number, rif: number | undefined): Rapporto => {
    const rap = rif ? stima / rif : null;
    return { voce, stima, riferimento: rif ?? 0, rapporto: rap, rosso: rap !== null && (rap < 0.85 || rap > 1.15) };
  };
  return [
    r("Standard", o.standard - o.standardDF, q("STANDARD")?.quantita), r("MAGG50", o.standardDF, q("MAGG50")?.quantita),
    r("STR30", o.straord - o.straordDom, q("STR30")?.quantita), r("SUPP18", o.suppl - o.supplDom, q("SUPP18")?.quantita),
    r("Teste", o.teste, q("STANDARD")?.teste),
  ];
}

/** Ore lavoro mese / mese precedente (fuori 0,7–1,4 = rosso). */
export function rapportoMesePrec(ore: number, prec: number | null) {
  const rap = prec ? ore / prec : null;
  return { ore, prec, rapporto: rap, rosso: rap !== null && (rap < 0.7 || rap > 1.4) };
}
