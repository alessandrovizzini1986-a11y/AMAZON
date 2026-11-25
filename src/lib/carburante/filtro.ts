/**
 * Filtri della pagina "Carburante: Q8 e telematica" (e del suo export Excel/CSV): stessi parametri nell'indirizzo,
 * stessa scelta delle righe. Puro: niente database, si usa dal server, dal browser e nei test.
 */
import { ELENCO_FLOTTE, riepiloga, type Flotta, type Riepilogo, type Riga } from "@/domain/carburante/riconciliazione";
import type { Archiviata } from "./riconciliazione";

export type FlottaFiltro = "TUTTE" | Flotta;
export type FiltroCarburante = {
  mese: string;
  flotta: FlottaFiltro;
  /** solo le righe di questo furgone (null = tutti) */
  targa: string | null;
  /** mostra anche le righe regolari */
  regolari: boolean;
  /** mostra anche le righe non verificabili */
  nonVerificabili: boolean;
  /** mostra anche le righe già giustificate */
  archiviate: boolean;
};
/** quello che serve di una riga per filtrarla (la pagina passa RigaPagina) */
export type RigaFiltrabile = Pick<Riga, "stato" | "flotta" | "targa" | "abituale"> & { archiviata: Archiviata | null };

export const isMeseValido = (m: string | null | undefined): m is string => !!m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

/** targa scritta in modo uniforme: maiuscole, senza spazi né trattini */
export const targaUniforme = (t: string | null | undefined) => String(t ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

type Parametri = URLSearchParams | Record<string, string | string[] | undefined>;
const leggi = (p: Parametri, k: string): string | null => {
  if (p instanceof URLSearchParams) return p.get(k);
  const v = p[k];
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
};
const si = (v: string | null) => v === "1" || v === "si" || v === "true";

/** Filtri dall'indirizzo. Il mese non valido diventa `meseDefault`; flotta sconosciuta → TUTTE. */
export function leggiFiltro(p: Parametri, meseDefault: string): FiltroCarburante {
  const mese = leggi(p, "mese");
  const flotta = (leggi(p, "flotta") ?? "").toUpperCase();
  const targa = targaUniforme(leggi(p, "targa")).slice(0, 12);
  return {
    mese: isMeseValido(mese) ? mese : meseDefault,
    flotta: (ELENCO_FLOTTE as string[]).includes(flotta) ? (flotta as Flotta) : "TUTTE",
    targa: targa || null,
    regolari: si(leggi(p, "regolari")),
    nonVerificabili: si(leggi(p, "nonverificabili")),
    archiviate: si(leggi(p, "archiviate")),
  };
}

/** Parametri dell'indirizzo per questi filtri (solo quelli diversi dal normale), es. "mese=2026-10&flotta=DER2&regolari=1". */
export function queryFiltro(f: FiltroCarburante, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  q.set("mese", f.mese);
  if (f.flotta !== "TUTTE") q.set("flotta", f.flotta);
  if (f.targa) q.set("targa", f.targa);
  if (f.regolari) q.set("regolari", "1");
  if (f.nonVerificabili) q.set("nonverificabili", "1");
  if (f.archiviate) q.set("archiviate", "1");
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}

/** La riga è di questo furgone? Per i pagamenti senza furgone vale il furgone abituale della carta. */
export function diTarga(r: Pick<Riga, "targa" | "abituale">, targa: string): boolean {
  const t = targaUniforme(targa);
  return targaUniforme(r.targa) === t || (!r.targa && targaUniforme(r.abituale?.targa) === t);
}

/** Righe di flotta e furgone scelti, archiviate comprese (base delle schede e del filtro). */
export function righeDiScope<R extends RigaFiltrabile>(righe: R[], f: Pick<FiltroCarburante, "flotta" | "targa">): R[] {
  return righe.filter((r) => (f.flotta === "TUTTE" || r.flotta === f.flotta) && (!f.targa || diTarga(r, f.targa)));
}

/** Le righe da mostrare (e da esportare), nell'ordine in cui arrivano (già per gravità ed euro). */
export function filtraRighe<R extends RigaFiltrabile>(righe: R[], f: Omit<FiltroCarburante, "mese">): R[] {
  return righeDiScope(righe, f).filter((r) =>
    (f.regolari || r.stato !== "REGOLARE") && (f.nonVerificabili || r.stato !== "NON_VERIFICABILE") && (f.archiviate || !r.archiviata));
}

/** Targhe presenti nelle righe della flotta scelta (furgone abbinato o abituale della carta), in ordine. */
export function targhePresenti(righe: RigaFiltrabile[], flotta: FlottaFiltro): string[] {
  const s = new Set<string>();
  for (const r of righe) {
    if (flotta !== "TUTTE" && r.flotta !== flotta) continue;
    const t = r.targa ?? r.abituale?.targa;
    if (t) s.add(t);
  }
  return [...s].sort();
}

/**
 * Numeri delle schede per flotta e furgone scelti: come il riepilogo del server (le archiviate non contano tra le
 * anomalie, ma i loro pagamenti sì tra quelli analizzati).
 */
export function riepilogoScope(righe: (RigaFiltrabile & Pick<Riga, "q8" | "deltaLitri" | "euro">)[], f: Pick<FiltroCarburante, "flotta" | "targa">): Riepilogo {
  const scope = righeDiScope(righe, f);
  const r = riepiloga(scope.filter((x) => !x.archiviata) as Riga[]);
  return { ...r, pagamentiQ8: scope.reduce((s, x) => s + x.q8.length, 0) };
}

/** Quante righe archiviate ci sono nello scope (per dire "N archiviate" accanto all'interruttore). */
export const quanteArchiviate = (righe: RigaFiltrabile[], f: Pick<FiltroCarburante, "flotta" | "targa">) => righeDiScope(righe, f).filter((r) => r.archiviata).length;
