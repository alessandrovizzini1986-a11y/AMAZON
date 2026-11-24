/**
 * Collegamento ai due portali di telematica (Targa Telematics e FlottaWeb) con l'utente salvato in "Portali fornitori".
 * Regola di sicurezza: dal sito si LEGGE soltanto. I portali hanno anche comandi sui mezzi (blocco motore, porte…):
 * qui passano solo richieste GET su percorsi dell'elenco consentito, mai un comando.
 */
import { db } from "@/lib/db";
import { decifra } from "@/lib/credenziali";

export type Fonte = "TARGA" | "FLOTTAWEB";
export const NOME_PORTALE: Record<Fonte, string> = { TARGA: "Targa Telematics", FLOTTAWEB: "FlottaWeb" };
export const ETICHETTA_FONTE = NOME_PORTALE;

export class ErroreTelematica extends Error {
  constructor(public passo: string, messaggio: string, public stato?: number) { super(messaggio); }
}

/** utente e password del portale, da "Portali fornitori" (il nome deve contenere "targa" o "flottaweb") */
export async function credenziali(fonte: Fonte): Promise<{ username: string; password: string }> {
  const chiave = fonte === "TARGA" ? "targa" : "flottaweb";
  const p = (await db.portaleCredenziale.findMany()).find((x) => x.portale.toLowerCase().replace(/\s+/g, "").includes(chiave));
  if (!p?.username || !p.passwordCifrata) throw new ErroreTelematica("credenziali", `In "Portali fornitori" manca il portale "${NOME_PORTALE[fonte]}" con utente e password.`);
  try { return { username: p.username, password: decifra(p.passwordCifrata) }; } catch { throw new ErroreTelematica("credenziali", "La password salvata non si legge più: reinseriscila in Portali fornitori."); }
}

/** percorsi dei comandi sui mezzi: non devono mai partire, nemmeno per sbaglio */
const VIETATI = /lock|unlock|engine|reset|impulse|startTracking|stopTracking|Monitoring|delete|remove|update|create|add|insert|assign|set[A-Z]|send|activate|\/out/i;
export function soloLettura(percorso: string) {
  if (VIETATI.test(percorso)) throw new ErroreTelematica("sicurezza", `Percorso non consentito (non è una lettura): ${percorso}`);
}

export async function conTempo(url: string, init: RequestInit, ms = 20000): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...init, signal: c.signal, cache: "no-store" }); }
  catch (e) { throw new ErroreTelematica("rete", (e as Error).name === "AbortError" ? "Il portale non ha risposto in tempo." : `Portale non raggiungibile: ${(e as Error).message}`); }
  finally { clearTimeout(t); }
}
