import "server-only";
import { db } from "@/lib/db";
import { GIUSTIFICATIVI_DEFAULT } from "@/domain/presenze/regole";
import { DISPATCHER_DEFAULT } from "@/domain/presenze/dispatcher";

/** Liste usate dai controlli (giustificativi, dispatcher, referenti). In questa fase: valori del kit. */
export async function configPresenze() {
  return {
    giustificativi: GIUSTIFICATIVI_DEFAULT.map((g) => g.codice),
    dispatcher: DISPATCHER_DEFAULT,
    referenti: {} as Record<string, string>,
  };
}

/** Esecuzioni salvate (ultime 20) con il numero di righe ancora aperte. */
export async function esecuzioni(tipo: "SETTIMANALE" | "FINE_MESE") {
  try {
    const runs = await db.presenzeRun.findMany({
      where: { tipo }, orderBy: { eseguitoIl: "desc" }, take: 20,
      include: { _count: { select: { risultati: { where: { esitoOps: "aperto" } } } } },
    });
    return runs.map((r) => ({
      id: r.id, station: r.station, da: r.periodoDa.toISOString().slice(0, 10), a: r.periodoA.toISOString().slice(0, 10),
      nAlert: r.nAlert, eseguitoDa: r.eseguitoDa, eseguitoIl: r.eseguitoIl.toISOString(), aperti: r._count.risultati,
    }));
  } catch {
    return []; // tabelle non ancora create su questo database
  }
}
