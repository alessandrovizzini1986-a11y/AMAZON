import { db } from "@/lib/db";
import { rateoFerie, type RateoFerie, type ValoreAssenza } from "@/domain/personale/buste";

const prima = (m: string) => { const [a, b] = m.split("-").map(Number); return b === 1 ? `${a - 1}-12` : `${a}-${String(b - 1).padStart(2, "0")}`; };

/**
 * Rateo di ferie e permessi per mese e station (SIC Amazon), dai saldi delle buste e dal valore di un giorno di ferie
 * e di un'ora di permesso dell'anagrafica dei costi più recente. Collega tre parti del sito: buste, anagrafica costi, organico.
 */
export async function rateiFerie(): Promise<RateoFerie[]> {
  const ultimaCdl = await db.anagraficaCDL.findFirst({ orderBy: { meseVersione: "desc" }, select: { meseVersione: true } });
  if (!ultimaCdl) return [];
  const [ratei, legami, cdl] = await Promise.all([
    db.personaleRateiPersona.findMany({ where: { gruppo: "SIC", station: { not: "GLS" } }, select: { mese: true, station: true, codice: true, ferieMatur: true, ferieGoduto: true, rolMatur: true, rolGoduto: true, exfestMatur: true, exfestGoduto: true } }),
    db.bustaLavoroPersona.findMany({ where: { gruppo: "SIC" }, select: { station: true, codice: true, cf: true }, distinct: ["station", "codice"] }),
    db.anagraficaCDL.findMany({ where: { meseVersione: ultimaCdl.meseVersione }, select: { cf: true, savingFeGg: true, savingRolH: true, savingExfH: true } }),
  ]);
  const cf = new Map(legami.map((l) => [`${l.station}|${l.codice}`, l.cf]));
  const val = new Map<string, ValoreAssenza>(cdl.filter((c) => c.savingFeGg !== null).map((c) => [c.cf, { ferieGg: Number(c.savingFeGg), rolH: Number(c.savingRolH ?? 0), exfH: Number(c.savingExfH ?? 0) }]));
  const valore = (station: string, codice: string) => val.get(cf.get(`${station}|${codice}`) ?? "") ?? null;
  const perMese = new Map<string, typeof ratei>();
  for (const r of ratei) perMese.set(r.mese, [...(perMese.get(r.mese) ?? []), r]);
  // gennaio azzera i contatori dell'anno: senza la busta di dicembre il rateo non si calcola
  return [...perMese.keys()].filter((m) => !m.endsWith("-01") && perMese.has(prima(m))).flatMap((m) => rateoFerie(m, perMese.get(m)!, perMese.get(prima(m))!, valore));
}
