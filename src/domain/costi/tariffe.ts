/** Tariffe e parametri con data di validità (SPEC §3: trasferta per data, alert cambio a 60/30/7 giorni). */
export type ValorePerData = { voce: string; validaDal: string; valore: number; fonte?: string | null };

/** Valore valido alla data (ultimo con validaDal ≤ data), o null. */
export function valoreAlla(tab: ValorePerData[], voce: string, data: string): number | null {
  let best: ValorePerData | null = null;
  for (const t of tab) if (t.voce === voce && t.validaDal <= data && (!best || t.validaDal > best.validaDal)) best = t;
  return best ? best.valore : null;
}

export const TRASFERTA = "TRASFERTA";
export const TRASFERTA_DOM_EXTRA = "TRASFERTA_DOM_EXTRA";

/** Trasferta del giorno: feriale, domenica = feriale + extra (7,00). */
export function trasfertaGiorno(tab: ValorePerData[], data: string, domenica: boolean): number {
  const f = valoreAlla(tab, TRASFERTA, data) ?? 0;
  return domenica ? f + (valoreAlla(tab, TRASFERTA_DOM_EXTRA, data) ?? 0) : f;
}

const giorni = (a: string, b: string) => Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);

/** Prossimo cambio di una voce dopo oggi, con soglia d'allerta raggiunta (60/30/7 giorni). */
export function prossimoCambio(tab: ValorePerData[], voce: string, oggi: string): { validaDal: string; valore: number; precedente: number | null; giorni: number; allerta: 60 | 30 | 7 | null } | null {
  const futuri = tab.filter((t) => t.voce === voce && t.validaDal > oggi).sort((a, b) => a.validaDal.localeCompare(b.validaDal));
  if (!futuri.length) return null;
  const n = futuri[0];
  const g = giorni(oggi, n.validaDal);
  return { validaDal: n.validaDal, valore: n.valore, precedente: valoreAlla(tab, voce, oggi), giorni: g, allerta: g <= 7 ? 7 : g <= 30 ? 30 : g <= 60 ? 60 : null };
}
