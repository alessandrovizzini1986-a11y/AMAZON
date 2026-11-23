import { normalizzaNumero } from "./numero";

export type EstrazioneNumeri = { numeri: string[]; righe: number; righeNumeroVuoto: number; refusiCorretti: number };

/** Numeri distinti (normalizzati, in ordine di prima comparsa) dalla colonna Numero di fatt_2026. */
export function estraiNumeri(valori: unknown[]): EstrazioneNumeri {
  const visti = new Set<string>();
  let vuoti = 0;
  let refusi = 0;
  for (const v of valori) {
    const raw = v === null || v === undefined ? "" : String(v).trim();
    if (!raw) { vuoti++; continue; }
    const n = normalizzaNumero(raw);
    if (n !== raw.toUpperCase()) refusi++;
    visti.add(n);
  }
  return { numeri: [...visti], righe: valori.length, righeNumeroVuoto: vuoti, refusiCorretti: refusi };
}

/** Testo incollato (un numero per riga, anche con TAB/virgole) → valori da passare a estraiNumeri. */
export const numeriDaTesto = (t: string) => t.split(/[\r\n\t,;]+/).map((x) => x.trim());

/**
 * Fatture "esportate ma non ancora in fatt_2026": scaricate dal portale e mai viste nel foglio. Non contano quelle
 * che hanno solo righe di anni precedenti (es. incentivi di dicembre 2025 fatturati a gennaio): vanno nel file dell'anno
 * del servizio, quindi in fatt_2026 non compariranno mai. Filtro Prisma, senza dipendenze dal client.
 */
export const ANNO_FOGLIO = 2026;
export const DA_INCOLLARE = { esportataIl: { not: null }, presenteInFatt2026Il: null, righe: { some: { anno: { gte: ANNO_FOGLIO } } } } as const;
