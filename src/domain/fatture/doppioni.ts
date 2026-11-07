/**
 * Righe di fattura probabilmente doppie: stessa fattura, stessa data, stessa quantità e stesso imponibile
 * (anche con descrizione diversa, es. "Incentivi - Pedaggi" accanto a "Incentivi - Parcheggio").
 * Le righe a zero e le rotte ("… Block of 8 Hours …": più rotte uguali nello stesso giorno sono normali) non contano.
 * Decide sempre una persona: la funzione segnala soltanto.
 */
export const ESCLUSA_DA_DOPPIONI = /block of/i;
export type RigaPerDoppioni = { id: string; data: string; quantita: number; avere: number; descrizione: string };

export const chiaveDoppione = (r: Pick<RigaPerDoppioni, "data" | "quantita" | "avere">) => `${r.data.slice(0, 10)}|${r.quantita}|${r.avere.toFixed(2)}`;

/** Gruppi di righe con la stessa chiave (2 o più), nell'ordine in cui compaiono. */
export function possibiliDoppioni<T extends RigaPerDoppioni>(righe: T[]): T[][] {
  const g = new Map<string, T[]>();
  for (const r of righe) {
    if (Math.abs(r.avere) < 0.005 || ESCLUSA_DA_DOPPIONI.test(r.descrizione)) continue;
    const k = chiaveDoppione(r);
    g.set(k, [...(g.get(k) ?? []), r]);
  }
  return [...g.values()].filter((x) => x.length > 1);
}

/** Totali della fattura dopo aver tolto delle righe. */
export function totaliFattura(righe: { totale: number; avere: number }[]) {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { nRighe: righe.length, sommaTotale: r2(righe.reduce((a, r) => a + r.totale, 0)), sommaAvere: r2(righe.reduce((a, r) => a + r.avere, 0)) };
}
