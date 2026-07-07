/**
 * Riconciliazione carburante — pura e testabile.
 * Confronta litri erogati (da transazioni Q8 per PAN carta) con i km percorsi
 * (da check-in/out) e segnala anomalie oltre la tolleranza configurata.
 */

export function consumoL100km(litri: number, km: number): number | null {
  if (km <= 0 || litri < 0) return null;
  return Math.round((litri / km) * 100 * 100) / 100;
}

export function isConsumoAnomalo(params: {
  consumoRilevato: number | null;
  consumoAtteso: number; // l/100km da config
  tolleranza: number; // frazione, es. 0.25
}): boolean {
  const { consumoRilevato, consumoAtteso, tolleranza } = params;
  if (consumoRilevato === null) return false;
  return consumoRilevato > consumoAtteso * (1 + tolleranza);
}
