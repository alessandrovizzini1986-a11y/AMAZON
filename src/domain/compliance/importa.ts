/**
 * Import dello stato letto sul portale (JSON incollato dall'admin). Calcola soltanto le differenze: chi le applica
 * lo decide dopo averle viste. Non cancella niente. Le righe che mancano le crea solo se l'admin lo chiede, e mai
 * per i folder che in anagrafica sono segnati "non lo usiamo" (per esempio le Dilazioni).
 */
import { z } from "zod";
import { scadenzaInterna, scadenzaPortale } from "./scadenze";
import type { Stato } from "./stato";

const file = z.object({ nome: z.string(), caricato_il: z.string().optional(), nota: z.string().optional() });
export const schemaImport = z.object({
  letto_il: z.string(),
  righe: z.array(z.object({
    entita: z.string(), area: z.string(), anno: z.number().int(), mese: z.number().int().min(1).max(12), folder: z.string(),
    stato_portale: z.enum(["VALIDATED", "VALIDATION_IN_PROGRESS", "OPEN_NOWORKFLOW_HASFILES", "OPEN"]),
    scadenza_portale: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(), file: z.array(file).optional(),
  })),
});
export type RigaPortale = z.infer<typeof schemaImport>["righe"][number];
export type RigaRegistro = { id: string; entita: string; area: string; anno: number; mese: number; folder: string; stato: Stato; scadenzaPortale: string | null };
export type Differenza = { id: string; chi: string; statoPrima: Stato; statoDopo: Stato | null; motivo: string | null; scadenzaPrima: string | null; scadenzaDopo: string | null; scadenzaInterna: string | null; avviso: string | null };

/** Sul portale il WHC si carica nel folder "Varie": nel registro quella riga si chiama "Varie – WHC". */
const ALIAS: Record<string, string> = { Varie: "Varie – WHC" };
const chiave = (r: { entita: string; area: string; anno: number; mese: number; folder: string }) => `${r.entita}|${r.area}|${r.anno}|${r.mese}|${ALIAS[r.folder.trim()] ?? r.folder.trim()}`;

/**
 * Il segnalibro che legge il portale apre il registro con i dati nell'indirizzo, dopo il cancelletto:
 * /compliance#import=<JSON in base64 per indirizzi>. Quello che sta dopo il cancelletto non viene mandato al server
 * e non finisce nei registri di accesso. Restituisce il testo JSON, o null se l'indirizzo non porta dati.
 */
export function daIndirizzo(hash: string): string | null {
  const m = /^#?import=([A-Za-z0-9_-]+=*)$/.exec(hash.trim());
  if (!m) return null;
  try {
    const b = atob(m[1].replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
  } catch { return null; }
}

/** L'inverso, per i test e per chi scrive il segnalibro. */
export function perIndirizzo(json: string): string {
  const b = String.fromCharCode(...new TextEncoder().encode(json));
  return `#import=${btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

export function differenze(portale: RigaPortale[], registro: RigaRegistro[]): { diff: Differenza[]; nonTrovati: string[] } {
  const per = new Map(registro.map((r) => [chiave(r), r]));
  const diff: Differenza[] = [], nonTrovati: string[] = [];
  for (const p of portale) {
    const r = per.get(chiave(p));
    if (!r) { nonTrovati.push(`${p.entita} ${p.area} ${String(p.mese).padStart(2, "0")}/${p.anno}: ${p.folder}`); continue; }
    const respinto = (p.file ?? []).find((f) => /FileNonConforme/i.test(f.nota ?? ""));
    let dopo: Stato | null = null, motivo: string | null = null, avviso: string | null = null;
    if (p.stato_portale === "VALIDATED") dopo = "VALIDATO";
    else if (p.stato_portale === "VALIDATION_IN_PROGRESS" || p.stato_portale === "OPEN_NOWORKFLOW_HASFILES") dopo = "CARICATO";
    else if (respinto) { dopo = "RESPINTO"; motivo = respinto.nota ?? "FileNonConforme"; }
    else if (!(p.file ?? []).length && r.stato === "CARICATO") avviso = "Incongruenza: qui c'è la spunta \"Caricato\" ma sul portale il folder è vuoto";
    if (dopo === r.stato) dopo = null;
    const scadDopo = p.scadenza_portale && p.scadenza_portale !== r.scadenzaPortale ? p.scadenza_portale : null;
    if (dopo || scadDopo || avviso) diff.push({ id: r.id, chi: `${p.entita} ${p.area} · ${String(p.mese).padStart(2, "0")}/${p.anno} · ${p.folder}`, statoPrima: r.stato, statoDopo: dopo, motivo, scadenzaPrima: r.scadenzaPortale, scadenzaDopo: scadDopo, scadenzaInterna: scadDopo ? scadenzaInterna(scadDopo) : null, avviso });
  }
  return { diff, nonTrovati };
}

export type TemplateImport = { id: string; entita: string; area: string; folder: string; regolaScadenza: string; usato: boolean };
export type DaCreare = { templateId: string; anno: number; mese: number; chi: string; stato: Stato; motivo: string | null; scadenzaPortale: string | null; scadenzaInterna: string | null };

/**
 * I folder del portale che nel registro non hanno la riga. Tre casi: da creare (folder che usiamo), ignorati
 * (in anagrafica "non lo usiamo": non li carichiamo mai, quindi niente riga), sconosciuti (non sono in anagrafica).
 */
export function mancanti(portale: RigaPortale[], registro: RigaRegistro[], template: TemplateImport[]): { daCreare: DaCreare[]; ignorati: string[]; sconosciuti: string[] } {
  const ci = new Set(registro.map(chiave));
  const tpl = new Map(template.map((t) => [`${t.entita}|${t.area}|${t.folder}`, t]));
  const daCreare: DaCreare[] = [], ignorati: string[] = [], sconosciuti: string[] = [], visti = new Set<string>();
  for (const p of portale) {
    const k = chiave(p);
    if (ci.has(k) || visti.has(k)) continue;
    visti.add(k);
    const chi = `${p.entita} ${p.area} ${String(p.mese).padStart(2, "0")}/${p.anno}: ${p.folder}`;
    const t = tpl.get(`${p.entita}|${p.area}|${ALIAS[p.folder.trim()] ?? p.folder.trim()}`);
    if (!t) { sconosciuti.push(chi); continue; }
    if (!t.usato) { ignorati.push(chi); continue; }
    const respinto = (p.file ?? []).find((f) => /FileNonConforme/i.test(f.nota ?? ""));
    const stato: Stato = p.stato_portale === "VALIDATED" ? "VALIDATO" : p.stato_portale !== "OPEN" ? "CARICATO" : respinto ? "RESPINTO" : "DA_RICHIEDERE";
    const scad = p.scadenza_portale ?? scadenzaPortale(t.regolaScadenza, p.anno, p.mese);
    daCreare.push({ templateId: t.id, anno: p.anno, mese: p.mese, chi, stato, motivo: stato === "RESPINTO" ? respinto?.nota ?? "FileNonConforme" : null, scadenzaPortale: scad, scadenzaInterna: scad ? scadenzaInterna(scad) : null });
  }
  return { daCreare, ignorati, sconosciuti };
}
