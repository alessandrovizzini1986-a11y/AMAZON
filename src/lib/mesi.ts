/** Mesi AAAA-MM: etichette in italiano, spostamenti, elenchi. Puro (server e client). */
export const MESI_NOMI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
export const COOKIE_MESE = "fleetdsp_mese";

export const etichettaMese = (m: string) => `${MESI_NOMI[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

export function meseSpostato(m: string, n: number): string {
  const [a, b] = m.split("-").map(Number);
  const t = a * 12 + (b - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export function mesiTra(da: string, a: string): string[] {
  const out: string[] = [];
  for (let m = da; m <= a && out.length < 600; m = meseSpostato(m, 1)) out.push(m);
  return out;
}

export const isMese = (m: string | undefined | null): m is string => !!m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

/** Mese della pagina: quello nell'indirizzo, poi quello ricordato (cookie), poi il predefinito. */
export const meseDaUsare = (q: string | undefined, ricordato: string | undefined, predefinito: string) => (isMese(q) ? q : isMese(ricordato) ? ricordato : predefinito);
