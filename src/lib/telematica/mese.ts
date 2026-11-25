/** Dati del mese dalla tabella dei giorni: riepilogo per targa e stato dello scarico giorno per giorno. */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { giorniDelMese, giornoRoma, riepilogoMese, type RigaGiorno } from "@/domain/telematica";
import { targaPulita } from "./posizioni";

export async function datiMese(mese: string) {
  const [righe, scarichi, mezzi] = await Promise.all([
    db.telematicaGiorno.findMany({ where: { giorno: { startsWith: mese } }, orderBy: [{ targa: "asc" }, { giorno: "asc" }] }),
    db.telematicaScarico.findMany({ where: { giorno: { startsWith: mese } } }),
    db.vehicle.findMany({ where: { stato: { not: "DISMESSO" } }, select: { targa: true, station: { select: { code: true } } } }),
  ]);
  const rifSenzaDettaglio = await db.telematicaGiorno.count({ where: { fonte: "TARGA", giorno: { startsWith: mese }, rifornimenti: { gt: 0 }, rifornimentiDett: { equals: Prisma.DbNull } } });
  const [spazio] = await db.$queryRaw<{ byte: bigint }[]>`select pg_total_relation_size('"TelematicaGiorno"') as byte`;
  const station = new Map(mezzi.map((m) => [targaPulita(m.targa), m.station.code]));
  const giorni: RigaGiorno[] = righe.map((r) => ({ fonte: r.fonte, targa: r.targa, giorno: r.giorno, km: r.km, inizio: r.inizio?.toISOString() ?? null, fine: r.fine?.toISOString() ?? null, guidaSec: r.guidaSec, motoreSec: r.motoreSec, fermoMotoreAccSec: r.fermoMotoreAccSec, velMax: r.velMax, punteggioSicurezza: r.punteggioSicurezza, soste: r.soste, rifornimenti: r.rifornimenti, litri: r.litri }));
  const oggi = giornoRoma(new Date());
  const stato = new Map(scarichi.map((s) => [s.giorno, s]));
  const calendario = giorniDelMese(mese).filter((g) => g <= oggi).map((g) => ({ giorno: g, scaricato: stato.has(g), definitivo: stato.get(g)?.definitivo ?? false, errori: stato.get(g)?.errori ?? 0 }));
  return { giorni, riepilogo: riepilogoMese(giorni, (t) => station.get(t) ?? null), calendario, rifSenzaDettaglio, spazioMb: Math.round((Number(spazio?.byte ?? 0) / 1048576) * 10) / 10, stationDi: (t: string) => station.get(t) ?? null };
}
