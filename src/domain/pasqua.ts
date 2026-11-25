/**
 * Pasqua gregoriana con l'algoritmo anonimo (Meeus/Jones/Butcher) → AAAA-MM-GG.
 * Modulo a sé, senza dipendenze: lo usano i festivi dei Costi e le decorazioni della login
 * (che così non si porta dietro nel bundle del browser il resto del modulo Costi).
 */
export function pasqua(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(mese).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`;
}
