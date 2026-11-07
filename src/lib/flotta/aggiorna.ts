import "server-only";
import type { ContractType, Prisma, VehicleStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { datiDaLista, normTarga, perStation, riconcilia, type CessatoRiga, type Esito, type FatturaRiga, type ListaRiga, type VeicoloSito } from "@/domain/flotta/riconcilia";
import { normalizeLeasingCompany, normalizeModello } from "@/domain/vehicleNames";
import { stimaCanone } from "@/domain/flotta/canoni";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const data = (s: string | number | null) => (s === null || s === "" ? null : new Date(`${String(s).slice(0, 10)}T00:00:00Z`));

/** Veicoli del sito nel formato della riconciliazione. */
export async function veicoliSito(): Promise<VeicoloSito[]> {
  const v = await db.vehicle.findMany({ include: { station: { select: { code: true } } } });
  return v.map((x) => ({
    id: x.id, targa: x.targa, station: x.station.code, stato: x.stato as VeicoloSito["stato"], modello: x.modello, leasingCompany: x.leasingCompany,
    tipoContratto: x.tipoContratto as VeicoloSito["tipoContratto"], contrattoLeasingNo: x.contrattoLeasingNo, contrattoDataInizio: iso(x.contrattoDataInizio),
    contrattoDataFine: iso(x.contrattoDataFine), canoneMese: x.canoneMese === null ? null : Number(x.canoneMese), note: x.note,
    franchigiaDanni: x.franchigiaDanni === null ? null : Number(x.franchigiaDanni), updatedAt: x.updatedAt.toISOString(),
  }));
}

export type DatiFlotta = { lista: ListaRiga[]; cessati: CessatoRiga[]; fatture: FatturaRiga[]; preferisciSito: boolean };

export async function calcola(d: DatiFlotta) {
  const sito = await veicoliSito();
  const esito = riconcilia({ lista: d.lista, cessati: d.cessati, fatture: d.fatture, sito, preferisciSito: d.preferisciSito });
  const stazioni = new Set((await db.station.findMany({ select: { code: true } })).map((s) => s.code));
  const senzaStation = [...esito.crea.map((c) => c.lista), ...esito.riattiva.map((r) => r.lista)].filter((r) => !stazioni.has(r.station)).map((r) => `${r.targa} (${r.station})`);
  return { esito, sito, senzaStation };
}

const CAMPI: Record<string, (v: string | number | null, idStation: Map<string, string>) => Prisma.VehicleUncheckedUpdateInput> = {
  station: (v, s) => ({ stationId: s.get(String(v))! }),
  stato: (v) => ({ stato: v as VehicleStatus }),
  leasingCompany: (v) => ({ leasingCompany: v === null ? null : String(v) }),
  tipoContratto: (v) => ({ tipoContratto: v as ContractType | null }),
  contrattoLeasingNo: (v) => ({ contrattoLeasingNo: v === null ? null : String(v) }),
  contrattoDataInizio: (v) => ({ contrattoDataInizio: data(v) }),
  contrattoDataFine: (v) => ({ contrattoDataFine: data(v) }),
  note: (v) => ({ note: v === null ? null : String(v) }),
  canoneMese: (v) => ({ canoneMese: v === null ? null : Number(v) }),
  franchigiaDanni: (v) => ({ franchigiaDanni: v === null ? null : Number(v) }),
};

/**
 * Scrive l'esito sul sito in una transazione: prima le uscite (la targa è unica tra i non dismessi), poi aggiornamenti
 * e riattivazioni (con storico stazioni), poi le nuove; infine uniforma società e marca/modello di tutti i veicoli.
 */
export async function applicaEsito(esito: Esito, userId: string, fonte: string) {
  const stazioni = await db.station.findMany({ select: { id: true, code: true } });
  const idStation = new Map(stazioni.map((s) => [s.code, s.id]));
  const oggi = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const nota = `aggiornamento flotta ${oggi.toISOString().slice(0, 10)}`;
  let nomi = 0;
  await db.$transaction(async (tx) => {
    for (const d of esito.dismetti) {
      const fine = data(d.cessato.fine) ?? oggi;
      await tx.vehicle.update({ where: { id: d.veicolo.id }, data: { stato: "DISMESSO", contrattoDataFine: d.veicolo.contrattoDataFine ? undefined : fine } });
      await tx.vehicleStationHistory.updateMany({ where: { vehicleId: d.veicolo.id, toDate: null }, data: { toDate: fine } });
    }
    const aggiorna = async (id: string, cambi: { campo: string; dopo: string | number | null }[], storicoDal: Date | null) => {
      const dati: Prisma.VehicleUncheckedUpdateInput = {};
      for (const c of cambi) Object.assign(dati, CAMPI[c.campo]?.(c.dopo, idStation) ?? {});
      if (Object.keys(dati).length) await tx.vehicle.update({ where: { id }, data: dati });
      const st = cambi.find((c) => c.campo === "station");
      if (st || storicoDal) {
        if (st) await tx.vehicleStationHistory.updateMany({ where: { vehicleId: id, toDate: null }, data: { toDate: oggi } });
        const v = await tx.vehicle.findUniqueOrThrow({ where: { id }, select: { stationId: true } });
        await tx.vehicleStationHistory.create({ data: { vehicleId: id, stationId: v.stationId, fromDate: storicoDal ?? oggi, note: nota } });
      }
    };
    for (const a of esito.aggiorna) await aggiorna(a.veicolo.id, a.cambi, null);
    for (const r of esito.riattiva) {
      const cambi = [...r.cambi];
      if (!cambi.some((c) => c.campo === "stato")) cambi.push({ campo: "stato", prima: "DISMESSO", dopo: datiDaLista(r.lista, null).stato });
      await aggiorna(r.veicolo.id, cambi, data(r.lista.inizio) ?? oggi);
    }
    for (const c of esito.crea) {
      const d = datiDaLista(c.lista, c.canone);
      const v = await tx.vehicle.create({
        data: {
          targa: d.targa, modello: d.modello, alimentazione: "DIESEL", stationId: idStation.get(d.station)!, stato: d.stato as VehicleStatus, leasingCompany: d.leasingCompany,
          tipoContratto: d.tipoContratto as ContractType | null, contrattoLeasingNo: d.contrattoLeasingNo, contrattoDataInizio: data(d.contrattoDataInizio), contrattoDataFine: data(d.contrattoDataFine),
          note: d.note, canoneMese: d.canoneMese, franchigiaDanni: d.franchigiaDanni,
        },
      });
      await tx.vehicleStationHistory.create({ data: { vehicleId: v.id, stationId: v.stationId, fromDate: data(d.contrattoDataInizio) ?? oggi, note: nota } });
    }
    // nomi uniformi su tutti i veicoli
    const tutti = await tx.vehicle.findMany({ select: { id: true, modello: true, leasingCompany: true } });
    for (const v of tutti) {
      const modello = normalizeModello(v.modello), societa = normalizeLeasingCompany(v.leasingCompany);
      if (modello !== v.modello || societa !== v.leasingCompany) { await tx.vehicle.update({ where: { id: v.id }, data: { modello, leasingCompany: societa } }); nomi++; }
    }
    await tx.auditLog.create({ data: { userId, action: "flotta.aggiorna", entity: "Vehicle", meta: { fonte, crea: esito.crea.length, riattiva: esito.riattiva.length, aggiorna: esito.aggiorna.length, dismetti: esito.dismetti.length, daVerificare: esito.daVerificare.map((d) => d.veicolo.targa), nomiUniformati: nomi } } });
  }, { timeout: 120_000, maxWait: 20_000 });
  return { nomi };
}

/** Controlli dopo la scrittura, rileggendo il sito. */
export async function controlli(lista: ListaRiga[]) {
  const sito = await veicoliSito();
  const vivi = sito.filter((v) => v.stato !== "DISMESSO");
  const L = new Set(lista.map((r) => r.targa));
  const conta = new Map<string, number>();
  for (const v of vivi) conta.set(normTarga(v.targa), (conta.get(normTarga(v.targa)) ?? 0) + 1);
  return {
    listaNonSulSito: lista.filter((r) => !vivi.some((v) => normTarga(v.targa) === r.targa)).map((r) => r.targa),
    sitoNonInLista: vivi.filter((v) => !L.has(normTarga(v.targa))).map((v) => `${v.targa} (${v.station}, ${v.stato.toLowerCase()})`),
    doppie: [...conta].filter(([, n]) => n > 1).map(([t]) => t),
    attiviSenzaCanone: vivi.filter((v) => v.stato === "ATTIVO" && !(v.canoneMese && v.canoneMese > 0)).map((v) => v.targa),
    sostitutiviConCanone: vivi.filter((v) => v.stato === "SOSTITUTIVO" && (v.canoneMese ?? 0) > 0).map((v) => v.targa),
    perStation: perStation(sito),
  };
}

/** Canoni stimati per gli attivi senza canone (mediana dei mezzi uguali; tariffe per società come fallback). */
export async function stimeCanoni(tariffe: Record<string, number> = {}) {
  const sito = await veicoliSito();
  return stimaCanone(sito.map((v) => ({ targa: v.targa, stato: v.stato, societa: v.leasingCompany, modello: v.modello, tipo: v.tipoContratto, canone: v.canoneMese })))
    .map((s) => (s.canone === null && s.societa && tariffe[s.societa] ? { ...s, canone: tariffe[s.societa], base: `tariffa ${s.societa} indicata` } : s));
}

export async function applicaStime(stime: { targa: string; canone: number; base: string }[], userId: string) {
  const oggi = new Date().toISOString().slice(0, 10).split("-").reverse().join("/");
  await db.$transaction(async (tx) => {
    for (const s of stime) {
      const v = await tx.vehicle.findFirst({ where: { targa: s.targa, stato: { not: "DISMESSO" } } });
      if (!v || (v.canoneMese !== null && Number(v.canoneMese) > 0)) continue;
      const n = `canone stimato il ${oggi}: ${s.base}; da sostituire con la prima fattura`;
      await tx.vehicle.update({ where: { id: v.id }, data: { canoneMese: s.canone, note: v.note ? `${v.note} · ${n}` : n } });
    }
    await tx.auditLog.create({ data: { userId, action: "flotta.canoni-stimati", entity: "Vehicle", meta: { stime: stime.map((s) => [s.targa, s.canone]) } } });
  }, { timeout: 60_000 });
}
