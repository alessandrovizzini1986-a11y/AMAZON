import { db } from "@/lib/db";
import { controlliOrganico, type Controlli, type Dispositivo } from "@/domain/personale/organico";

/** Gli incroci sull'ultimo organico caricato (null se non ce n'è). */
export async function incrociOrganico(oggi = new Date()): Promise<(Controlli & { versione: string; versioneCdl: string | null }) | null> {
  const ultima = await db.organicoPersona.findFirst({ orderBy: { versione: "desc" }, select: { versione: true } });
  if (!ultima) return null;
  const cdlUltima = await db.anagraficaCDL.findFirst({ orderBy: { meseVersione: "desc" }, select: { meseVersione: true } });
  const [organico, telefoni, sim, cdl] = await Promise.all([
    db.organicoPersona.findMany({ where: { versione: ultima.versione } }),
    db.telefono.findMany({ where: { assegnatario: { not: null } }, select: { assegnatario: true, station: true, stato: true, modello: true } }),
    db.sim.findMany({ where: { assegnatario: { not: null } }, select: { assegnatario: true, station: true, stato: true, numero: true } }),
    cdlUltima ? db.anagraficaCDL.findMany({ where: { meseVersione: cdlUltima.meseVersione }, select: { cf: true, cognome: true, nome: true, station: true } }) : Promise.resolve([]),
  ]);
  const dispositivi: Dispositivo[] = [
    ...telefoni.map((t) => ({ tipo: "Telefono" as const, assegnatario: t.assegnatario, station: t.station, stato: t.stato, cosa: t.modello ?? "telefono" })),
    ...sim.map((s) => ({ tipo: "SIM" as const, assegnatario: s.assegnatario, station: s.station, stato: s.stato, cosa: `SIM …${s.numero.slice(-4)}` })),
  ];
  return { ...controlliOrganico(organico, dispositivi, cdl, oggi), versione: ultima.versione, versioneCdl: cdlUltima?.meseVersione ?? null };
}
