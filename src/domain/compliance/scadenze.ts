/**
 * Scadenze del Compliance Tool. M = mese di competenza del documento.
 * Tutte le date sono giorni di calendario (AAAA-MM-GG): nessun fuso, nessuna ora.
 */
export type Regola = "fine_M+1" | "15_M+2" | "20_M+1" | "manuale";
export const REGOLE: Regola[] = ["fine_M+1", "15_M+2", "20_M+1", "manuale"];
export const NOME_REGOLA: Record<Regola, string> = { "fine_M+1": "fine del mese dopo", "15_M+2": "15 del secondo mese dopo", "20_M+1": "20 del mese dopo", manuale: "la inserisce l'admin" };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const giorno = (s: string) => new Date(`${s}T00:00:00Z`);

/** Scadenza sul portale per il mese di competenza (mese 1–12), o null se la regola è manuale. */
export function scadenzaPortale(regola: string, anno: number, mese: number): string | null {
  if (regola === "fine_M+1") return iso(new Date(Date.UTC(anno, mese + 1, 0))); // giorno 0 di M+2 = ultimo di M+1
  if (regola === "15_M+2") return iso(new Date(Date.UTC(anno, mese + 1, 15)));
  if (regola === "20_M+1") return iso(new Date(Date.UTC(anno, mese, 20)));
  return null;
}

/**
 * Scadenza interna = portale meno 5 giorni lavorativi: si contano all'indietro solo i giorni da lunedì a venerdì,
 * partendo dal giorno prima della scadenza. Le festività non contano.
 */
export function scadenzaInterna(portale: string | null, lavorativi = 5): string | null {
  if (!portale) return null;
  const d = giorno(portale);
  let n = 0;
  while (n < lavorativi) {
    d.setUTCDate(d.getUTCDate() - 1);
    const g = d.getUTCDay();
    if (g !== 0 && g !== 6) n++;
  }
  return iso(d);
}

/** Giorni di calendario da oggi alla data (negativo = già passata). */
export const giorniA = (data: string, oggi: string) => Math.round((giorno(data).getTime() - giorno(oggi).getTime()) / 864e5);

/** Il template genera una riga in quel mese? (mesiAttivi vuoto = tutti i mesi) */
export function attivoNelMese(mesiAttivi: string, mese: number): boolean {
  const m = mesiAttivi.split(",").map((x) => Number(x.trim())).filter((x) => x >= 1 && x <= 12);
  return m.length === 0 || m.includes(mese);
}

export const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
export const nomeMese = (anno: number, mese: number) => `${MESI[mese - 1]} ${anno}`;
/** GG/MM/AAAA */
export const it = (s: string | null | undefined) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "");
