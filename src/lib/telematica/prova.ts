/**
 * Prova del collegamento: entra nei due portali, fa poche letture di base e salva un CAMPIONE di ogni risposta
 * (al massimo 3 elementi per elenco). Serve a vedere come sono fatti i dati prima di costruire mappa e report.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ErroreTelematica, type Fonte } from "./comune";
import { accediFlottaweb, leggiFlottaweb } from "./flottaweb";
import { accediTarga, leggiTarga } from "./targa";

export const LETTURE: Record<Fonte, { percorso: string; cosa: string; parametri?: Record<string, string> }[]> = {
  FLOTTAWEB: [
    { percorso: "/user/info", cosa: "Il tuo utente" },
    { percorso: "/fleet/list", cosa: "Flotte" },
    { percorso: "/unit/list", cosa: "Mezzi" },
    { percorso: "/driver/list", cosa: "Autisti" },
    { percorso: "/unit/gps/getrealtime", cosa: "Posizioni in tempo reale" },
  ],
  TARGA: [
    { percorso: "/user/context", cosa: "Il tuo utente" },
    { percorso: "/fleets/stats", cosa: "Flotte" },
    { percorso: "/units/lean", cosa: "Mezzi" },
    { percorso: "/units/plates", cosa: "Targhe" },
    { percorso: "/drivers/list", cosa: "Autisti" },
    { percorso: "/realtime/units/positions", cosa: "Posizioni in tempo reale", parametri: { showOperativeStatus: "false", timezone: "Europe/Rome", background: "false", inactive: "false" } },
  ],
};

/** conta gli elementi e tiene solo un campione: elenchi tagliati a 3, testi a 200 caratteri, 6 livelli al massimo */
export function campione(v: unknown, livello = 0): unknown {
  if (livello > 6) return "…";
  if (Array.isArray(v)) return v.slice(0, 3).map((x) => campione(x, livello + 1));
  if (v && typeof v === "object") {
    const voci = Object.entries(v as Record<string, unknown>);
    // oggetto usato come elenco (tante chiavi con la stessa forma): tengo le prime 3
    const tagliate = voci.length > 60 ? voci.slice(0, 3) : voci;
    return Object.fromEntries(tagliate.map(([k, x]) => [k, campione(x, livello + 1)]));
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
  try { token = fonte === "TARGA" ? await accediTarga() : await accediFlottaweb(); await salva({ fonte, chiamata: "login", cosa: "Accesso", ok: true, stato: 200, elementi: null, errore: null }); }
  catch (e) { const x = e as ErroreTelematica; await salva({ fonte, chiamata: "login", cosa: "Accesso", ok: false, stato: x.stato ?? null, elementi: null, errore: x.message }); return esiti; }
  for (const l of LETTURE[fonte]) {
    try {
      const r = fonte === "TARGA" ? await leggiTarga(token, l.percorso, l.parametri) : await leggiFlottaweb(token, l.percorso, l.parametri);
      await salva({ fonte, chiamata: l.percorso, cosa: l.cosa, ok: true, stato: 200, elementi: conta(r), errore: null }, r);
    } catch (e) { const x = e as ErroreTelematica; await salva({ fonte, chiamata: l.percorso, cosa: l.cosa, ok: false, stato: x.stato ?? null, elementi: null, errore: x.message }); }
  }
  return esiti;
}
