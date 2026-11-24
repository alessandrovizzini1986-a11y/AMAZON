/** Giornata di consegna di una station: ogni furgone con telematica, cosa ha fatto quel giorno e cosa c'è da guardare. */
import { db } from "@/lib/db";
import { avvisiMezzo, basi, giornataMezzo, luogo, mediana, tappeDelGiorno, type Avviso, type Tappa } from "@/domain/telematica";
import { targaPulita } from "./posizioni";

export type RigaGiornata = {
  targa: string; fonte: string; km: number; partenza: string | null; rientro: string | null; fuoriMin: number; guidaMin: number; soste: number; sosteMin: number;
  sostaLunga: { min: number; dove: string | null; da: string } | null; fermoAccesoMin: number; velMax: number | null; rifornimenti: number; litri: number; parteDa: string | null; finisceA: string | null; avvisi: Avviso[]; tappe: Tappa[];
};
export type Giornata = {
  station: string; giorno: string; scaricato: boolean; definitivo: boolean; basi: string[]; luoghi: { luogo: string; tipo: string; nota: string | null }[]; inFlotta: number; conTelematica: number; rottePreviste: number | null;
  righe: RigaGiornata[];
};

/** le station che hanno almeno un furgone sui portali di telematica */
export async function stationConTelematica(): Promise<string[]> {
  const [targhe, mezzi] = await Promise.all([
    db.telematicaGiorno.findMany({ distinct: ["targa"], select: { targa: true } }),
    db.vehicle.findMany({ where: { stato: { not: "DISMESSO" } }, select: { targa: true, station: { select: { code: true } } } }),
  ]);
  const viste = new Set(targhe.map((t) => t.targa));
  return [...new Set(mezzi.filter((m) => viste.has(targaPulita(m.targa))).map((m) => m.station.code))].sort();
}

export async function datiGiornata(station: string, giorno: string): Promise<Giornata> {
  const mezzi = await db.vehicle.findMany({ where: { stato: { not: "DISMESSO" }, station: { code: station } }, select: { targa: true } });
  const targhe = mezzi.map((m) => targaPulita(m.targa));
  const mese = giorno.slice(0, 7);
  const [luoghi, delGiorno, delMese, scarico, ultimoForecast] = await Promise.all([
    db.telematicaLuogo.findMany({ where: { station }, select: { luogo: true, tipo: true, nota: true }, orderBy: { luogo: "asc" } }),
    db.telematicaGiorno.findMany({ where: { giorno, targa: { in: targhe } }, orderBy: { targa: "asc" } }),
    // le basi si ricavano da dove partono i furgoni della station in tutto il mese: un giorno solo è troppo poco
    db.telematicaGiorno.findMany({ where: { giorno: { startsWith: mese }, targa: { in: targhe }, km: { gte: 1 } }, select: { tappe: true } }),
    db.telematicaScarico.findUnique({ where: { giorno } }),
    db.forecastRoute.findFirst({ where: { station, data: new Date(`${giorno}T00:00:00Z`) }, orderBy: { file: { caricatoIl: "desc" } }, select: { fileId: true } }),
  ]);
  const previste = ultimoForecast ? await db.forecastRoute.aggregate({ where: { station, data: new Date(`${giorno}T00:00:00Z`), fileId: ultimoForecast.fileId }, _sum: { routes: true } }) : null;
  const partenze = delMese.map((r) => { const t = tappeDelGiorno(r.tappe as Tappa[] | null); const i = t.findIndex((x) => x.t === "G"); return i <= 0 ? null : luogo(t[i - 1].dove); });
  // base = dove partono i furgoni nel mese + i parcheggi segnati a mano; le officine sono a parte
  const officine = luoghi.filter((l) => l.tipo === "OFFICINA").map((l) => l.luogo);
  const case_ = Object.fromEntries(luoghi.filter((l) => l.tipo === "CASA").map((l) => [l.luogo, l.nota ?? ""]));
  const basiStation = [...new Set([...basi(partenze).filter((b) => !officine.includes(b) && !(b in case_)), ...luoghi.filter((l) => l.tipo === "PARCHEGGIO").map((l) => l.luogo)])];
  const medianaKm = mediana(delGiorno.filter((r) => r.km >= 1).map((r) => r.km));
  const righe: RigaGiornata[] = delGiorno.map((r) => {
    const g = giornataMezzo(r.tappe as Tappa[] | null, basiStation);
    return {
      targa: r.targa, fonte: r.fonte, km: r.km, partenza: g.partenza, rientro: g.rientro, fuoriMin: g.fuoriMin, guidaMin: Math.round(r.guidaSec / 60), soste: g.soste, sosteMin: g.sosteMin, sostaLunga: g.sostaLunga,
      fermoAccesoMin: Math.round(r.fermoMotoreAccSec / 60), velMax: r.velMax, rifornimenti: r.rifornimenti, litri: r.litri, parteDa: g.parteDa, finisceA: g.finisceA,
      avvisi: avvisiMezzo({ km: r.km, velMax: r.velMax, fermoMotoreAccSec: r.fermoMotoreAccSec }, g, basiStation, medianaKm, officine, case_), tappe: r.km >= 1 ? g.tappe : [],
    };
  });
  return { station, giorno, scaricato: !!scarico, definitivo: scarico?.definitivo ?? false, basi: basiStation, luoghi, inFlotta: mezzi.length, conTelematica: delGiorno.length, rottePreviste: previste?._sum.routes ?? null, righe };
}
