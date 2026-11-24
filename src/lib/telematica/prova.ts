/**
 * Prova del collegamento: entra nei due portali, fa poche letture di base e salva un CAMPIONE di ogni risposta
 * (al massimo 3 elementi per elenco). Serve a vedere come sono fatti i dati prima di costruire mappa e report.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ErroreTelematica, type Fonte } from "./comune";
import { accediFlottaweb, leggiFlottaweb } from "./flottaweb";
import { accediTarga, leggiTarga } from "./targa";

const giorno = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
type Lettura = { percorso: string; cosa: string; parametri?: Record<string, string> };
/** letture che hanno bisogno di un mezzo: si fanno sul primo mezzo trovato, per ieri o per gli ultimi 7 giorni */
export function lettureDiProva(fonte: Fonte, primo: unknown): Lettura[] {
  if (fonte === "TARGA") {
    const id = (Array.isArray(primo) ? (primo[0] as { idUnit?: number })?.idUnit : null) ?? null;
    if (!id) return [];
    return [
      { percorso: "/coveredDistance/getDailyDistances", cosa: "Km al giorno (un mezzo, 7 giorni)", parametri: { idUnit: String(id), dateFrom: giorno(7), dateTo: giorno(1) } },
      { percorso: `/route/${id}`, cosa: "Percorso di ieri (un mezzo)", parametri: { begin: `${giorno(1)}T00:00:00.000+01:00`, end: `${giorno(1)}T23:59:59.999+01:00`, timezone: "Europe/Rome", showIdlingSegments: "true", showDriverName: "true" } },
      { percorso: `/unit/${id}/`, cosa: "Scheda di un mezzo" },
      { percorso: "/unit/getUnitCounters", cosa: "Contatori (km, ore motore)", parametri: { idUnit: String(id) } },
    ];
  }
  const id = ((primo as { units?: { unitid?: number }[] })?.units ?? [])[0]?.unitid ?? null;
  if (!id) return [];
  const u = String(id);
  return [
    { percorso: "/gps/getpositions", cosa: "Percorso di ieri (un mezzo)", parametri: { unitid: u, da: `${giorno(1)} 00:00:00`, a: `${giorno(1)} 23:59:59` } },
    { percorso: "/gps/trip/list", cosa: "Viaggi (un mezzo, 7 giorni)", parametri: { unitid: u, da: giorno(7), a: giorno(0) } },
    { percorso: "/unit/gps/historical/positions", cosa: "Posizioni di ieri (un mezzo)", parametri: { unitid: u, data: giorno(1) } },
    { percorso: "/gps/getstartstop", cosa: "Partenze e soste (un mezzo)", parametri: { unitid: u, da: giorno(1), a: giorno(0) } },
    { percorso: "/report/km/day", cosa: "Km al giorno (un mezzo)", parametri: { unitid: u, da: giorno(7), a: giorno(0) } },
    { percorso: "/refuel/list", cosa: "Rifornimenti (7 giorni)", parametri: { da: giorno(7), a: giorno(0) } },
    { percorso: "/canbus/refuel/list", cosa: "Rifornimenti da centralina (un mezzo)", parametri: { unitid: u, da: giorno(7), a: giorno(0) } },
  ];
}

export const LETTURE: Record<Fonte, { percorso: string; cosa: string; parametri?: Record<string, string> }[]> = {
  FLOTTAWEB: [
    { percorso: "/user/info", cosa: "Il tuo utente" },
    { percorso: "/fleet/list", cosa: "Flotte" },
    { percorso: "/unit/list", cosa: "Mezzi" },
    { percorso: "/driver/list", cosa: "Autisti" },
  ],
  TARGA: [
    { percorso: "/user/context", cosa: "Il tuo utente" },
    { percorso: "/fleets/stats", cosa: "Flotte" },
    { percorso: "/units/lean", cosa: "Mezzi" },
    { percorso: "/drivers/teams", cosa: "Squadre autisti" },
    { percorso: "/realtime/units/positions", cosa: "Posizioni in tempo reale", parametri: { showOperativeStatus: "false", timezone: "Europe/Rome", background: "false", inactive: "false" } },
  ],
};

/** chiavi che possono contenere segreti del portale: nel campione non si salvano mai */
const SEGRETO = /password|token|api_?key|secret|videoserver/i;

/** conta gli elementi e tiene solo un campione: elenchi tagliati a 3, testi a 200 caratteri, 6 livelli al massimo */
export function campione(v: unknown, livello = 0): unknown {
  if (livello > 6) return "…";
  if (Array.isArray(v)) return v.slice(0, 3).map((x) => campione(x, livello + 1));
  if (v && typeof v === "object") {
    const voci = Object.entries(v as Record<string, unknown>);
    // oggetto usato come elenco (tante chiavi con la stessa forma): tengo le prime 3
    const tagliate = voci.length > 60 ? voci.slice(0, 3) : voci;
    return Object.fromEntries(tagliate.map(([k, x]) => [k, SEGRETO.test(k) && x ? "(nascosto)" : campione(x, livello + 1)]));
  }
  return typeof v === "string" && v.length > 200 ? v.slice(0, 200) + "…" : v;
}
export function conta(v: unknown): number | null {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === "object") {
    const elenchi = Object.values(v as Record<string, unknown>).filter(Array.isArray) as unknown[][];
    if (elenchi.length) return Math.max(...elenchi.map((e) => e.length));
    return Object.keys(v).length;
  }
  return null;
}

export type EsitoProva = { fonte: Fonte; chiamata: string; cosa: string; ok: boolean; stato: number | null; elementi: number | null; errore: string | null };

export async function provaFonte(fonte: Fonte): Promise<EsitoProva[]> {
  const esiti: EsitoProva[] = [];
  const salva = async (e: EsitoProva, risposta?: unknown) => {
    esiti.push(e);
    const dati = { cosa: e.cosa, ok: e.ok, stato: e.stato, elementi: e.elementi, errore: e.errore, risposta: risposta === undefined ? Prisma.DbNull : (campione(risposta) as Prisma.InputJsonValue), eseguitaIl: new Date() };
    await db.telematicaProva.upsert({ where: { fonte_chiamata: { fonte, chiamata: e.chiamata } }, create: { fonte, chiamata: e.chiamata, ...dati }, update: dati });
  };
  let token: string;
  try { token = fonte === "TARGA" ? await accediTarga(true) : await accediFlottaweb(true); await salva({ fonte, chiamata: "login", cosa: "Accesso", ok: true, stato: 200, elementi: null, errore: null }); }
  catch (e) { const x = e as ErroreTelematica; await salva({ fonte, chiamata: "login", cosa: "Accesso", ok: false, stato: x.stato ?? null, elementi: null, errore: x.message }); return esiti; }
  const elencoMezzi = fonte === "TARGA" ? "/units/lean" : "/unit/list";
  const coda: Lettura[] = [...LETTURE[fonte]];
  for (let i = 0; i < coda.length; i++) {
    const l = coda[i];
    // il percorso di un mezzo ha l'id dentro: nel registro lo tolgo, così la riga resta una sola
    const nome = l.percorso.replace(/\/\d+(\/|$)/, "/{mezzo}$1");
    try {
      const r = fonte === "TARGA" ? await leggiTarga(token, l.percorso, l.parametri) : await leggiFlottaweb(token, l.percorso, l.parametri);
      await salva({ fonte, chiamata: nome, cosa: l.cosa, ok: true, stato: 200, elementi: conta(r), errore: null }, r);
      if (l.percorso === elencoMezzi) coda.push(...lettureDiProva(fonte, r));
    } catch (e) { const x = e as ErroreTelematica; await salva({ fonte, chiamata: nome, cosa: l.cosa, ok: false, stato: x.stato ?? null, elementi: null, errore: x.message }); }
  }
  return esiti;
}
