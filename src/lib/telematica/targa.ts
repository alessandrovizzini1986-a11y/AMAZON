/**
 * Targa Telematics: l'accesso passa dal loro sistema unico (Keycloak). Si prova prima l'accesso diretto con utente e password;
 * se non è abilitato si fa lo stesso giro del browser (pagina di login → codice → gettone). Poi solo letture (GET).
 */
import { conTempo, credenziali, ErroreTelematica, soloLettura } from "./comune";

const SITO = "https://fleet.targatelematics.com";
const SSO = "https://sso.targatelematics.com/auth/realms/targatelematics/protocol/openid-connect";
const CLIENT = "t2", RITORNO = `${SITO}/tx/home`;
const FORM = { "Content-Type": "application/x-www-form-urlencoded" };

async function gettone(corpo: Record<string, string>) {
  const r = await conTempo(`${SSO}/token`, { method: "POST", headers: FORM, body: new URLSearchParams({ client_id: CLIENT, ...corpo }).toString() });
  const j = (await r.json().catch(() => null)) as { access_token?: string; error?: string; error_description?: string } | null;
  return { stato: r.status, token: j?.access_token, errore: j?.error, descrizione: j?.error_description };
}

const biscotti = (r: Response, prima = "") => {
  const nuovi = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]);
  return [...prima.split("; ").filter(Boolean), ...nuovi].join("; ");
};

async function accessoDaBrowser(c: { username: string; password: string }): Promise<string> {
  const q = new URLSearchParams({ client_id: CLIENT, redirect_uri: RITORNO, response_type: "code", scope: "openid", response_mode: "query" });
  const pagina = await conTempo(`${SSO}/auth?${q}`, { method: "GET", redirect: "manual" });
  const html = await pagina.text();
  const azione = html.match(/<form[^>]+action="([^"]+)"/i)?.[1]?.replace(/&amp;/g, "&");
  if (!azione) throw new ErroreTelematica("login", "La pagina di accesso di Targa non è quella attesa (forse chiede un secondo fattore o è cambiata).", pagina.status);
  const invio = await conTempo(azione, { method: "POST", redirect: "manual", headers: { ...FORM, Cookie: biscotti(pagina) }, body: new URLSearchParams({ username: c.username, password: c.password, credentialId: "" }).toString() });
  const dove = invio.headers.get("location") ?? "";
  const codice = dove.startsWith(RITORNO) ? new URL(dove).searchParams.get("code") : null;
  if (!codice) throw new ErroreTelematica("login", invio.status === 200 ? "Targa ha rifiutato utente o password (o chiede un passaggio in più, per esempio un codice)." : `Accesso Targa non riuscito (risposta ${invio.status}).`, invio.status);
  const g = await gettone({ grant_type: "authorization_code", code: codice, redirect_uri: RITORNO });
  if (!g.token) throw new ErroreTelematica("login", `Targa non ha dato il gettone (${g.errore ?? g.stato}).`, g.stato);
  return g.token;
}

export async function accediTarga(): Promise<string> {
  const c = await credenziali("TARGA");
  const g = await gettone({ grant_type: "password", scope: "openid", username: c.username, password: c.password });
  if (g.token) return g.token;
  if (g.errore === "invalid_grant") throw new ErroreTelematica("login", "Targa ha rifiutato utente o password.", g.stato);
  return accessoDaBrowser(c);
}

export async function leggiTarga(token: string, percorso: string, parametri: Record<string, string> = {}): Promise<unknown> {
  soloLettura(percorso);
  const q = new URLSearchParams(parametri).toString();
  const r = await conTempo(`${SITO}/t2/api${percorso}${q ? `?${q}` : ""}`, { method: "GET", headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new ErroreTelematica("lettura", `Targa ha risposto ${r.status} a ${percorso}`, r.status);
  return r.json();
}
