/** service_type_scheduling (+ cycle, + station) del forecast → classe di fatturato (SPEC §7.1). */
export type RegolaMappa = { serviceType: string; cycle: string; station: string; classe: string };

/** La regola più specifica vince: station esatta prima di "*", poi cycle esatto prima di "*". */
export function classeForecast(serviceType: string, cycle: string, station: string, regole: RegolaMappa[]): string {
  const s = serviceType.trim(), c = cycle.trim(), st = station.trim();
  let best: RegolaMappa | null = null, punti = -1;
  for (const r of regole) {
    if (r.serviceType.trim() !== s) continue;
    if (r.cycle !== "*" && r.cycle !== c) continue;
    if (r.station !== "*" && r.station !== st) continue;
    const p = (r.station !== "*" ? 2 : 0) + (r.cycle !== "*" ? 1 : 0);
    if (p > punti) { punti = p; best = r; }
  }
  return best?.classe ?? "NON_MAPPATO";
}

/** Linea del file dal nome: "next" → ND, "same" → SD, altrimenti null (da chiedere). */
export const lineaDaNome = (nome: string): "ND" | "SD" | null => (/next/i.test(nome) ? "ND" : /same/i.test(nome) ? "SD" : null);
