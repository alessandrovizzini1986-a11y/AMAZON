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

/** legge una fonte; se il gettone in memoria è scaduto (401/403) rifà il login una volta */
async function leggi(fonte: Fonte): Promise<Omit<Posizione, "station">[]> {
  const una = async (forza: boolean) => fonte === "TARGA"
    ? daTarga(await leggiTarga(await accediTarga(forza), "/realtime/units/positions", { showOperativeStatus: "true", timezone: "Europe/Rome", background: "false", inactive: "false" }))
    : daFlottaweb(await leggiFlottaweb(await accediFlottaweb(forza), "/unit/list"));
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
