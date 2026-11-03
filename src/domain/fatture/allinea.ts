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
