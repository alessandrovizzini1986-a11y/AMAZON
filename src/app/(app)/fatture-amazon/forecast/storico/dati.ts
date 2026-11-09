import "server-only";
import { dsAmazon } from "@/domain/fatture/fatturato";
import { db } from "@/lib/db";
import { calibra, finestra, type Calibrazione, type RigaCalibrazione } from "@/domain/forecast/tariffe";
import { reale } from "@/domain/forecast/previsione";
import { addGiorni, chiusa, fatturataTutta, inizioSettimana, numeroSettimana } from "@/domain/forecast/settimane";
import { precisione, storico, ultimaVersione, type PuntoVersione, type Precisione } from "@/domain/forecast/storico";
import { versioniForecast } from "@/lib/forecastVersioni";

export type DatiStorico = {
  oggi: string; settimanaCorrente: string; versioneInUso: { nd: string | null; sd: string | null };
  punti: PuntoVersione[]; reale: Record<string, { eur: number; rotte: number; eurND: number; rotteND: number; eurSD: number; rotteSD: number }>; precisione: Precisione[];
  flotta: Record<string, { attivi: number; sostitutivi: number; officina: number }>; stations: string[];
};

/** Tutte le versioni dei forecast caricati, con € calcolati con la calibrazione adatta a ogni settimana target. */
export async function calcolaStorico(n: number, oggi: string): Promise<DatiStorico> {
  const [vers, rotte, veicoli] = await Promise.all([
    versioniForecast(),
    db.forecastRoute.findMany({ select: { fileId: true, data: true, station: true, cycle: true, classe: true, routes: true } }),
    db.vehicle.groupBy({ by: ["stationId", "stato"], where: { stato: { in: ["ATTIVO", "SOSTITUTIVO", "IN_OFFICINA"] } }, _count: { _all: true } }),
  ]);
  const righeFc = rotte.map((r) => ({ fileId: r.fileId, data: r.data.toISOString().slice(0, 10), station: dsAmazon(r.station), cycle: r.cycle, classe: r.classe, routes: r.routes }));
  const primaData = righeFc.reduce((m, r) => (r.data < m ? r.data : m), addGiorni(oggi, -14));
  const daQuando = addGiorni(inizioSettimana(primaData), -7 * (n + 8));
  const linee = await db.amazonInvoiceLine.findMany({ where: { data: { gte: new Date(daQuando + "T00:00:00Z") } }, select: { ds: true, data: true, classe: true, quantita: true, avere: true } });
  const righe: RigaCalibrazione[] = linee.map((l) => ({ ds: dsAmazon(l.ds), data: l.data.toISOString().slice(0, 10), classe: l.classe, quantita: l.quantita, avere: Number(l.avere) }));
  const calOggi = calibra(righe, finestra(righe, n, oggi));
  const cache = new Map<string, Calibrazione>();
  const calPer = (w: string) => {
    if (!chiusa(w, oggi)) return calOggi;
    if (!cache.has(w)) cache.set(w, calibra(righe, finestra(righe, n, oggi, w)));
    return cache.get(w)!;
  };
  const punti = storico(vers, righeFc, calPer);
  // giorni con fattura per DS: la settimana conta come fatturata appena ci sono tutti e 7 (o comunque dopo 14 giorni)
  const giorniDs = new Map<string, Set<string>>();
  for (const r of righe) { if (!giorniDs.has(r.ds)) giorniDs.set(r.ds, new Set()); giorniDs.get(r.ds)!.add(r.data); }
  const conFatturato = (s: string, w: string) => chiusa(w, oggi) || fatturataTutta(w, oggi, giorniDs.get(s) ?? new Set());
  const realeMap: DatiStorico["reale"] = {};
  for (const p of ultimaVersione(punti)) {
    if (!conFatturato(p.station, p.settimana)) continue;
    const r = reale(righe, p.station, p.settimana);
    if (r) realeMap[`${p.station}|${p.settimana}`] = { eur: r.avere, rotte: r.rotte, eurND: r.avereND, rotteND: r.rotteND, eurSD: r.avereSD, rotteSD: r.rotteSD };
  }
  const prec = precisione(punti, (s, w) => realeMap[`${s}|${w}`]?.eur ?? null, (w) => chiusa(w, oggi) || Object.keys(realeMap).some((k) => k.endsWith(`|${w}`)));
  const stationsDb = await db.station.findMany({ select: { id: true, code: true } });
  const code = new Map(stationsDb.map((s) => [s.id, s.code]));
  const flotta: DatiStorico["flotta"] = {};
  for (const v of veicoli) {
    const c = code.get(v.stationId) ?? "?";
    const f = (flotta[c] ??= { attivi: 0, sostitutivi: 0, officina: 0 });
    if (v.stato === "ATTIVO") f.attivi += v._count._all; else if (v.stato === "SOSTITUTIVO") f.sostitutivi += v._count._all; else f.officina += v._count._all;
  }
  const ultimo = (linea: string) => vers.filter((f) => f.linea === linea).sort((a, b) => `${b.versione}|${b.caricatoIl}`.localeCompare(`${a.versione}|${a.caricatoIl}`))[0];
  const nd = ultimo("ND"), sd = ultimo("SD");
  return {
    oggi, settimanaCorrente: inizioSettimana(oggi), punti, reale: realeMap, precisione: prec, flotta,
    versioneInUso: { nd: nd ? `wk ${numeroSettimana(nd.versione)} · ${nd.nome}` : null, sd: sd ? `wk ${numeroSettimana(sd.versione)} · ${sd.nome}` : null },
    stations: [...new Set(punti.map((p) => p.station))].sort(),
  };
}
