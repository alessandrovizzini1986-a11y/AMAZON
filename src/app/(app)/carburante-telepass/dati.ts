import "server-only";
import { db } from "@/lib/db";

/** Mappa codice dispositivo → station (solo dispositivi ancora presenti nell'ultimo file). */
export async function mappaTelepass(): Promise<Record<string, string>> {
  try {
    const d = await db.telepassDispositivo.findMany({ where: { nonPiuInFile: false }, select: { codice: true, station: true } });
    return Object.fromEntries(d.map((x) => [x.codice, x.station]));
  } catch {
    return {};
  }
}

/** Censimento per l'abbinamento Q8 (solo carte ancora presenti nell'ultimo file). */
export async function censimento() {
  try {
    const c = await db.cartaCarburante.findMany({ where: { nonPiuInFile: false }, orderBy: { ordine: "asc" } });
    return c.map((x) => ({
      pan: x.pan, numeroCarta: x.numeroCarta, identificativo: x.identificativo, targa: x.targa, bloccata: x.bloccata,
      dataBlocco: x.dataBlocco ? x.dataBlocco.toISOString().slice(0, 10) : null, centroCosto: x.centroCosto, appalto: x.appalto, ds: x.ds, ordine: x.ordine,
    }));
  } catch {
    return [];
  }
}

export async function ultimiImport() {
  try {
    const r = await db.anagraficaImport.findMany({ orderBy: { eseguitoIl: "desc" }, take: 30 });
    return r.map((x) => ({ ...x, eseguitoIl: x.eseguitoIl.toISOString() }));
  } catch {
    return [];
  }
}

export type RunRiga = { id: string; anno: number; mese: number; nomeFile: string; righe: number; anomalie: number; totale: number; totali: Record<string, Record<string, number>>; eseguitoDa: string; eseguitoIl: string };

export async function runTelepass(): Promise<RunRiga[]> {
  try {
    const r = await db.telepassRun.findMany({ orderBy: { eseguitoIl: "desc" }, take: 24 });
    return r.map((x) => ({ id: x.id, anno: x.anno, mese: x.mese, nomeFile: x.nomeFile, righe: x.righe, anomalie: x.nonMappati + x.ricondotti, totale: x.totale, totali: x.totaliJson as RunRiga["totali"], eseguitoDa: x.eseguitoDa, eseguitoIl: x.eseguitoIl.toISOString() }));
  } catch {
    return [];
  }
}

export async function runQ8(): Promise<RunRiga[]> {
  try {
    const r = await db.q8Run.findMany({ orderBy: { eseguitoIl: "desc" }, take: 24 });
    return r.map((x) => ({ id: x.id, anno: x.anno, mese: x.mese, nomeFile: x.nomeFile, righe: x.tenute, anomalie: x.nonCensite + x.perIdentificativo, totale: x.totale, totali: x.totaliJson as RunRiga["totali"], eseguitoDa: x.eseguitoDa, eseguitoIl: x.eseguitoIl.toISOString() }));
  } catch {
    return [];
  }
}
