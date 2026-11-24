/** FlottaWeb: login con utente e password → gettone "X-Auth-Token"; poi solo letture (GET). */
import { conTempo, credenziali, ErroreTelematica, soloLettura } from "./comune";

const BASE = "https://apils.flottaweb.eu/atlas/platform";
// chiave pubblica dell'applicazione web di FlottaWeb (è nel codice della loro pagina, uguale per tutti: non è un segreto nostro)
const FE_API_KEY = "fM3Pd2J42zRjzWDGPBQbkmuuPhPmGP6A3cQbyB7";
const intestazioni = (token?: string) => ({ "Content-Type": "application/json", Accept: "application/json", "FE-Api-Key": FE_API_KEY, ...(token ? { "X-Auth-Token": token } : {}) });

export async function accediFlottaweb(): Promise<string> {
  const c = await credenziali("FLOTTAWEB");
  const r = await conTempo(`${BASE}/auth`, { method: "POST", headers: intestazioni(), body: JSON.stringify(c) });
  const j = (await r.json().catch(() => null)) as { token?: string } | null;
  if (!r.ok || !j?.token) throw new ErroreTelematica("login", r.status === 401 || r.status === 403 ? "FlottaWeb ha rifiutato utente o password." : `Login FlottaWeb non riuscito (risposta ${r.status}).`, r.status);
  return j.token;
}

export async function leggiFlottaweb(token: string, percorso: string, parametri: Record<string, string> = {}): Promise<unknown> {
  soloLettura(percorso);
  const q = new URLSearchParams(parametri).toString();
  const r = await conTempo(`${BASE}${percorso}${q ? `?${q}` : ""}`, { method: "GET", headers: intestazioni(token) });
  if (!r.ok) throw new ErroreTelematica("lettura", `FlottaWeb ha risposto ${r.status} a ${percorso}`, r.status);
  return r.json();
}
