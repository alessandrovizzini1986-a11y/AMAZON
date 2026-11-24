/** Posizioni in tempo reale dei mezzi dai due portali, in un formato unico, con la station presa dalla flotta del sito. */
import { db } from "@/lib/db";
import { ErroreTelematica, type Fonte } from "./comune";
import { accediFlottaweb, leggiFlottaweb } from "./flottaweb";
import { accediTarga, leggiTarga } from "./targa";

export type Posizione = { fonte: Fonte; targa: string; nome: string; lat: number; lon: number; velocita: number; quando: string | null; stato: string; station: string | null; autista: string | null };
export type EsitoPosizioni = { posizioni: Posizione[]; errori: { fonte: Fonte; messaggio: string }[]; lettoIl: string };

export const targaPulita = (t: unknown) => String(t ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const num = (x: unknown) => (typeof x === "number" ? x : Number(x) || 0);

type RigaTarga = { plate?: string; name?: string; speed?: number; unitOperativeStatus?: string; location?: { latitude?: number; longitude?: number; timestamp?: string } | null };
export function daTarga(righe: unknown): Omit<Posizione, "station">[] {
  return (Array.isArray(righe) ? (righe as RigaTarga[]) : []).filter((r) => r.location && num(r.location.latitude) !== 0).map((r) => ({
    fonte: "TARGA" as const, targa: targaPulita(r.plate || r.name), nome: String(r.name ?? r.plate ?? ""), lat: num(r.location!.latitude), lon: num(r.location!.longitude),
    velocita: num(r.speed), quando: r.location!.timestamp ?? null, stato: String(r.unitOperativeStatus ?? ""), autista: null,
  }));
}

type OraFw = { year?: string; month?: string; day?: string; hour?: string; minute?: string; seconds?: string };
type RigaFw = { vrn?: string; name?: string; speed?: number; latitude?: number; longitude?: number; status?: string; autista?: string; dateTime?: OraFw };
/** FlottaWeb dà l'ora a pezzi, in ora italiana: la riscrivo come data ISO senza fuso (il browser la mostra così com'è) */
const oraFw = (d?: OraFw) => (d?.year && d.year !== "1970" ? `${d.year}-${d.month}-${d.day}T${d.hour}:${d.minute}:${d.seconds ?? "00"}` : null);
export function daFlottaweb(risposta: unknown): Omit<Posizione, "station">[] {
  const righe = ((risposta as { units?: RigaFw[] })?.units ?? []) as RigaFw[];
  return righe.filter((r) => num(r.latitude) !== 0).map((r) => ({
    fonte: "FLOTTAWEB" as const, targa: targaPulita(r.vrn || r.name), nome: String(r.name ?? r.vrn ?? ""), lat: num(r.latitude), lon: num(r.longitude),
    velocita: num(r.speed), quando: oraFw(r.dateTime), stato: String(r.status ?? ""), autista: r.autista || null,
  }));
}

type PuntoFw = { lat?: number; lon?: number; speed?: number; dateTime?: string; status?: string; autista?: string };
/** FlottaWeb: l'ultimo punto di un percorso → posizione del mezzo (l'ora è italiana, senza fuso) */
export function ultimoPuntoFw(risposta: unknown, targa: string): Omit<Posizione, "station"> | null {
  const r = (risposta ?? {}) as { message?: PuntoFw[]; markers?: PuntoFw[] };
  const punti = (Array.isArray(r.message) && r.message.length ? r.message : r.markers ?? []).filter((p) => num(p.lat) !== 0 && p.dateTime);
  const u = punti.sort((a, b) => a.dateTime!.localeCompare(b.dateTime!)).at(-1);
  if (!u) return null;
  return { fonte: "FLOTTAWEB", targa, nome: targa, lat: num(u.lat), lon: num(u.lon), velocita: num(u.speed), quando: u.dateTime!.replace(" ", "T"), stato: String(u.status ?? ""), autista: u.autista && u.autista !== "-" ? u.autista : null };
}

/** FlottaWeb: l'elenco mezzi spesso non porta le coordinate; per chi non le ha prendo l'ultimo punto degli ultimi 3 giorni */
async function flottaweb(forza: boolean): Promise<Omit<Posizione, "station">[]> {
  const token = await accediFlottaweb(forza);
  const elenco = await leggiFlottaweb(token, "/unit/list");
  const conPosizione = daFlottaweb(elenco);
  const viste = new Set(conPosizione.map((p) => p.targa));
  const altri = (((elenco as { units?: { unitid?: number; vrn?: string; name?: string }[] })?.units ?? [])).filter((u) => u.unitid && !viste.has(targaPulita(u.vrn || u.name)));
  const giorno = (k: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date(Date.now() - k * 86400000));
  const trovati = await Promise.all(altri.map(async (u) => {
    try { return ultimoPuntoFw(await leggiFlottaweb(token, "/gps/getpositions", { unitid: String(u.unitid), da: `${giorno(3)} 00:00:00`, a: `${giorno(0)} 23:59:59` }), targaPulita(u.vrn || u.name)); }
    catch (e) { if (e instanceof ErroreTelematica && (e.stato === 401 || e.stato === 403)) throw e; return null; }
  }));
  return [...conPosizione, ...trovati.filter((p): p is Omit<Posizione, "station"> => p !== null)];
}

/** legge una fonte; se il gettone in memoria è scaduto (401/403) rifà il login una volta */
async function leggi(fonte: Fonte): Promise<Omit<Posizione, "station">[]> {
  const una = async (forza: boolean) => fonte === "TARGA"
    ? daTarga(await leggiTarga(await accediTarga(forza), "/realtime/units/positions", { showOperativeStatus: "true", timezone: "Europe/Rome", background: "false", inactive: "false" }))
    : flottaweb(forza);
  try { return await una(false); }
  catch (e) { if (e instanceof ErroreTelematica && (e.stato === 401 || e.stato === 403)) return una(true); throw e; }
}

export async function posizioniLive(): Promise<EsitoPosizioni> {
  const fonti: Fonte[] = ["TARGA", "FLOTTAWEB"];
  const [esiti, mezzi] = await Promise.all([
    Promise.allSettled(fonti.map(leggi)),
    db.vehicle.findMany({ where: { stato: { not: "DISMESSO" } }, select: { targa: true, station: { select: { code: true } } } }),
  ]);
  const station = new Map(mezzi.map((m) => [targaPulita(m.targa), m.station.code]));
  const posizioni: Posizione[] = [], errori: EsitoPosizioni["errori"] = [];
  esiti.forEach((e, i) => {
    if (e.status === "fulfilled") posizioni.push(...e.value.map((p) => ({ ...p, station: station.get(p.targa) ?? null })));
    else errori.push({ fonte: fonti[i], messaggio: e.reason instanceof Error ? e.reason.message : "Lettura non riuscita" });
  });
  posizioni.sort((a, b) => (a.station ?? "ZZ").localeCompare(b.station ?? "ZZ") || a.targa.localeCompare(b.targa));
  return { posizioni, errori, lettoIl: new Date().toISOString() };
}
