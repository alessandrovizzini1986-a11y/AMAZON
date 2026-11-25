/**
 * Chiave delle transazioni Q8 non reversibile. Solo server (usa node:crypto: non entra nel codice del browser).
 *
 * Il browser calcola una "chiave client" con il PAN intero (pan|giorno|ora|litri|importo, più "#2", "#3"… per le righe
 * uguali dello stesso file). Il server la trasforma con un HMAC-SHA256 e un segreto che sta solo nel database
 * (tabella SegretoInterno, riga "q8.chiave"): dalla chiave salvata non si risale al numero della carta, nemmeno provando
 * tutti i PAN possibili, perché senza il segreto non si può rifare il calcolo.
 *
 * Chiave salvata: ultime 4 cifre | giorno | ora | primi 20 caratteri esadecimali dell'HMAC.
 * Lo stesso file ricaricato dà le stesse chiavi (stesso segreto): niente doppioni.
 */
import { createHmac } from "node:crypto";

/** pan|AAAA-MM-GG|HH:MM:SS|litri|importo[#n]. Il PAN (anche vuoto) è tutto quello che sta prima dei quattro campi finali. */
const FORMATO_CLIENT = /^(.*)\|(\d{4}-\d{2}-\d{2})\|(\d{2}:\d{2}:\d{2})\|(-?\d+\.\d{2})\|(-?\d+\.\d{2})(?:#([1-9]\d*))?$/;
/** lunghezza massima di una chiave client (PAN di 40 caratteri + resto) */
export const MAX_CHIAVE_CLIENT = 120;
/** almeno 128 bit di segreto (la migrazione ne genera 64 caratteri esadecimali) */
const MIN_SEGRETO = 32;

/** true se il testo ha la forma di una chiave client calcolata da transazioniDaEsito */
export const chiaveClientValida = (s: string) => s.length <= MAX_CHIAVE_CLIENT && FORMATO_CLIENT.test(s);

/** Il PAN da salvare: solo le ultime 4 cifre, precedute da "…" (vuoto se il file non lo riporta). */
export const panMascherato = (pan: string) => (pan.trim() ? `…${pan.trim().slice(-4)}` : "");

/**
 * Chiave da salvare a partire dalla chiave client e dal segreto. Funzione pura: la usano il server (con segretoQ8) e lo
 * script dello storico (con il segreto passato a mano).
 */
export function chiaveQ8Da(chiaveClient: string, segreto: string): string {
  const m = chiaveClient.length <= MAX_CHIAVE_CLIENT ? FORMATO_CLIENT.exec(chiaveClient) : null;
  if (!m) throw new Error("chiave della transazione Q8 non valida");
  if (segreto.length < MIN_SEGRETO) throw new Error("segreto delle chiavi Q8 troppo corto");
  const firma = createHmac("sha256", segreto).update(chiaveClient, "utf8").digest("hex").slice(0, 20);
  return `${m[1].trim().slice(-4)}|${m[2]}|${m[3]}|${firma}`;
}

export class SegretoMancante extends Error {}

let inCache: Promise<string> | null = null;

/** Il segreto delle chiavi Q8 (SegretoInterno "q8.chiave"), letto dal database una volta sola e poi tenuto in memoria. */
export function segretoQ8(): Promise<string> {
  inCache ??= (async () => {
    // import al momento: lo script dello storico usa chiaveQ8Da senza aprire il database
    const { db } = await import("@/lib/db");
    const r = await db.segretoInterno.findUnique({ where: { chiave: "q8.chiave" }, select: { valore: true } }).catch((e: unknown) => {
      // P2021 = tabella inesistente: la migrazione che crea SegretoInterno non è stata applicata
      if ((e as { code?: string } | null)?.code === "P2021") throw new SegretoMancante("tabella SegretoInterno assente nel database");
      throw e;
    });
    if (!r || r.valore.length < MIN_SEGRETO) throw new SegretoMancante("segreto q8.chiave assente nel database");
    return r.valore;
  })().catch((e) => { inCache = null; throw e; });
  return inCache;
}
