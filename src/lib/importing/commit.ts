import "server-only";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import type { Role, VehicleStatus, FuelType, ServiceType, FineStatus, ReplacementReason, PracticeStatus } from "@prisma/client";

/**
 * Risoluzione FK + controllo duplicati + inserimento per ogni entità di import.
 * dryRun=true → nessuna scrittura, solo esiti riga per riga (usato in anteprima).
 * Il chiamante decide la politica: import parziale (solo righe ok) o blocco totale.
 */

export type RowOutcome = {
  rowIndex: number;
  status: "ok" | "duplicate" | "error";
  message: string;
};

type Ctx = {
  dryRun: boolean;
  stationByCode: Map<string, string>;
  vehicleByTarga: Map<string, string>; // solo veicoli non dismessi
  userByEmail: Map<string, string>;
};

async function buildCtx(dryRun: boolean): Promise<Ctx> {
  const [stations, vehicles, users] = await Promise.all([
    db.station.findMany({ select: { id: true, code: true } }),
    db.vehicle.findMany({ where: { stato: { not: "DISMESSO" } }, select: { id: true, targa: true } }),
    db.user.findMany({ select: { id: true, email: true } }),
  ]);
  return {
    dryRun,
    stationByCode: new Map(stations.map((s) => [s.code.toUpperCase(), s.id])),
    vehicleByTarga: new Map(vehicles.map((v) => [v.targa.toUpperCase(), v.id])),
    userByEmail: new Map(users.map((u) => [u.email.toLowerCase(), u.id])),
  };
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
const up = (v: unknown) => s(v)?.toUpperCase() ?? null;

async function commitVehicleRow(row: Row, ctx: Ctx): Promise<RowOutcome["status"] | string> {
  const targa = up(row.targa)!;
  if (ctx.vehicleByTarga.has(targa)) return `targa ${targa} già presente tra i veicoli attivi`;
  const stationId = ctx.stationByCode.get(up(row.stationCode)!);
  if (!stationId) return `stazione "${row.stationCode}" inesistente`;
  if (!ctx.dryRun) {
    const v = await db.vehicle.create({
      data: {
        targa,
        modello: s(row.modello)!,
        allestimento: s(row.allestimento),
        alimentazione: row.alimentazione as FuelType,
        hvoCompatibile: row.hvoCompatibile === true || row.alimentazione === "DIESEL_HVO",
        immatricolazione: row.immatricolazione as Date,
        stationId,
        stato: (row.stato as VehicleStatus) ?? "ATTIVO",
        kmAttuali: (row.kmAttuali as number) ?? 0,
        canoneGiorno: row.canoneGiorno as number,
        leasingCompany: s(row.leasingCompany),
        contrattoLeasingNo: s(row.contrattoLeasingNo),
        prossimoTagliandoData: (row.prossimoTagliandoData as Date) ?? null,
        prossimoTagliandoKm: (row.prossimoTagliandoKm as number) ?? null,
        prossimaRevisione: (row.prossimaRevisione as Date) ?? null,
        stationHistory: { create: { stationId, fromDate: new Date(), note: "import iniziale" } },
      },
    });
    ctx.vehicleByTarga.set(targa, v.id);
  } else {
    ctx.vehicleByTarga.set(targa, "dry-run"); // rileva duplicati anche interni al file
  }
  return "ok";
}

async function commitDriverRow(row: Row, ctx: Ctx): Promise<RowOutcome["status"] | string> {
  const email = s(row.email)!.toLowerCase();
  if (ctx.userByEmail.has(email)) return `email ${email} già registrata`;
  const role = ((row.role as Role) ?? "DRIVER") as Role;
  const stationId = row.stationCode ? ctx.stationByCode.get(up(row.stationCode)!) : null;
  if (row.stationCode && !stationId) return `stazione "${row.stationCode}" inesistente`;
  if (role !== "ADMIN" && !stationId) return `stazione obbligatoria per ruolo ${role}`;
  if (!ctx.dryRun) {
    const tempPassword = crypto.randomBytes(6).toString("base64url");
    const u = await db.user.create({
      data: {
        email,
        passwordHash: await hashPassword(tempPassword),
        firstName: s(row.firstName)!,
        lastName: s(row.lastName)!,
        role,
        stationId,
        licenseNo: s(row.licenseNo),
        phone: s(row.phone),
      },
    });
    ctx.userByEmail.set(email, u.id);
    return `ok — password temporanea: ${tempPassword}`;
  }
  ctx.userByEmail.set(email, "dry-run");
  return "ok";
}

async function commitServiceRow(row: Row, ctx: Ctx): Promise<RowOutcome["status"] | string> {
  const vehicleId = ctx.vehicleByTarga.get(up(row.targa)!);
  if (!vehicleId) return `veicolo con targa ${row.targa} inesistente`;
  if (vehicleId !== "dry-run") {
    const dup = await db.serviceRecord.findFirst({
      where: { vehicleId, data: row.data as Date, tipo: row.tipo as ServiceType },
    });
    if (dup) return `intervento ${row.tipo} del ${(row.data as Date).toLocaleDateString("it-IT")} già presente per ${row.targa}`;
  }
  if (!ctx.dryRun) {
    await db.serviceRecord.create({
      data: {
        vehicleId,
        tipo: row.tipo as ServiceType,
        officina: s(row.officina)!,
        data: row.data as Date,
        kmIntervento: row.kmIntervento as number,
        costo: row.costo as number,
        descrizione: s(row.descrizione),
      },
    });
  }
  return "ok";
}

async function commitFineRow(row: Row, ctx: Ctx): Promise<RowOutcome["status"] | string> {
  const vehicleId = ctx.vehicleByTarga.get(up(row.targa)!);
  if (!vehicleId) return `veicolo con targa ${row.targa} inesistente`;
  let driverId: string | null = null;
  if (row.driverEmail) {
    driverId = ctx.userByEmail.get(s(row.driverEmail)!.toLowerCase()) ?? null;
    if (!driverId) return `conducente ${row.driverEmail} inesistente`;
  }
  if (vehicleId !== "dry-run") {
    const dup = await db.fine.findFirst({
      where: row.verbaleNo
        ? { verbaleNo: s(row.verbaleNo) }
        : { vehicleId, dataOraInfrazione: row.dataOraInfrazione as Date },
    });
    if (dup) return `multa già presente (${row.verbaleNo ? `verbale ${row.verbaleNo}` : "stessa targa e data/ora"})`;
  }
  if (!ctx.dryRun) {
    await db.fine.create({
      data: {
        vehicleId,
        verbaleNo: s(row.verbaleNo),
        dataOraInfrazione: row.dataOraInfrazione as Date,
        luogo: s(row.luogo)!,
        tipoViolazione: s(row.tipoViolazione)!,
        importo: row.importo as number,
        puntiPatente: (row.puntiPatente as number) ?? 0,
        stato: (row.stato as FineStatus) ?? "DA_NOTIFICARE",
        dataNotifica: (row.dataNotifica as Date) ?? null,
        driverId,
        assegnazioneFonte: driverId ? "import storico" : null,
      },
    });
  }
  return "ok";
}

async function commitLeaseRow(row: Row, ctx: Ctx): Promise<RowOutcome["status"] | string> {
  const vehicleId = ctx.vehicleByTarga.get(up(row.targa)!);
  if (!vehicleId) return `veicolo con targa ${row.targa} inesistente`;
  if (!ctx.dryRun && vehicleId !== "dry-run") {
    await db.vehicle.update({
      where: { id: vehicleId },
      data: {
        canoneGiorno: row.canoneGiorno as number,
        leasingCompany: s(row.leasingCompany),
        contrattoLeasingNo: s(row.contrattoLeasingNo),
      },
    });
  }
  return "ok";
}

async function commitMovementRow(row: Row, ctx: Ctx): Promise<RowOutcome["status"] | string> {
  const vehicleId = ctx.vehicleByTarga.get(up(row.targa)!);
  if (!vehicleId) return `veicolo con targa ${row.targa} inesistente`;
  const driverId = ctx.userByEmail.get(s(row.driverEmail)!.toLowerCase());
  if (!driverId) return `driver ${row.driverEmail} inesistente`;
  const stationId = ctx.stationByCode.get(up(row.stationCode)!);
  if (!stationId) return `stazione "${row.stationCode}" inesistente`;
  if (vehicleId !== "dry-run") {
    const dup = await db.assignment.findFirst({ where: { vehicleId, date: row.date as Date } });
    if (dup) return `assegnazione per ${row.targa} in data ${(row.date as Date).toLocaleDateString("it-IT")} già presente`;
  }
  if (!ctx.dryRun && driverId !== "dry-run") {
    await db.assignment.create({
      data: {
        date: row.date as Date,
        vehicleId,
        driverId,
        stationId,
        checkInKm: (row.checkInKm as number) ?? null,
        checkOutKm: (row.checkOutKm as number) ?? null,
      },
    });
  }
  return "ok";
}

async function commitReplacementRow(row: Row, ctx: Ctx): Promise<RowOutcome["status"] | string> {
  const vehicleId = ctx.vehicleByTarga.get(up(row.targa)!);
  if (!vehicleId) return `veicolo con targa ${row.targa} inesistente`;
  const replacementVehicleId = row.targaSostitutivo
    ? ctx.vehicleByTarga.get(up(row.targaSostitutivo)!) ?? null
    : null;
  if (row.targaSostitutivo && !replacementVehicleId) return `mezzo sostitutivo ${row.targaSostitutivo} inesistente`;
  if (vehicleId !== "dry-run") {
    const dup = await db.replacementCase.findFirst({
      where: { vehicleId, dataIngressoOfficina: row.dataIngressoOfficina as Date },
    });
    if (dup) return `pratica già presente per ${row.targa} con ingresso ${(row.dataIngressoOfficina as Date).toLocaleDateString("it-IT")} — storno duplicato non ammesso`;
  }
  if (!ctx.dryRun) {
    await db.replacementCase.create({
      data: {
        vehicleId,
        motivo: row.motivo as ReplacementReason,
        dataIngressoOfficina: row.dataIngressoOfficina as Date,
        centroConvenzionato: s(row.centroConvenzionato)!,
        replacementVehicleId: replacementVehicleId === "dry-run" ? null : replacementVehicleId,
        dataRicezioneSostitutivo: (row.dataRicezioneSostitutivo as Date) ?? null,
        dataRientroOriginale: (row.dataRientroOriginale as Date) ?? null,
        stato: (row.stato as PracticeStatus) ?? "APERTA",
        note: s(row.note),
      },
    });
  }
  return "ok";
}

async function commitFuelRow(row: Row, ctx: Ctx, importJobId: string | null): Promise<RowOutcome["status"] | string> {
  const pan = s(row.pan)!;
  if (!ctx.dryRun) {
    const card = await db.fuelCard.upsert({
      where: { pan },
      update: {},
      create: { pan }, // carta non ancora associata a un veicolo: si associa in /fuel
    });
    const dup = await db.fuelTransaction.findFirst({
      where: { fuelCardId: card.id, data: row.data as Date, importo: row.importo as number },
    });
    if (dup) return `transazione già presente (PAN ${pan}, ${(row.data as Date).toLocaleString("it-IT")})`;
    await db.fuelTransaction.create({
      data: {
        fuelCardId: card.id,
        data: row.data as Date,
        litri: row.litri as number,
        importo: row.importo as number,
        puntoVendita: s(row.puntoVendita),
        prodotto: s(row.prodotto),
        importJobId,
      },
    });
  } else {
    const card = await db.fuelCard.findUnique({ where: { pan } });
    if (card) {
      const dup = await db.fuelTransaction.findFirst({
        where: { fuelCardId: card.id, data: row.data as Date, importo: row.importo as number },
      });
      if (dup) return `transazione già presente (PAN ${pan}, ${(row.data as Date).toLocaleString("it-IT")})`;
    }
  }
  return "ok";
}

async function commitTollRow(row: Row, ctx: Ctx, importJobId: string | null): Promise<RowOutcome["status"] | string> {
  const stationId = ctx.stationByCode.get(up(row.stationCode)!);
  if (!stationId) return `stazione "${row.stationCode}" inesistente`;
  const dup = await db.tollTransaction.findFirst({
    where: { stationId, data: row.data as Date, importo: row.importo as number, targa: up(row.targa) },
  });
  if (dup) return `pedaggio già presente (${row.stationCode}, ${(row.data as Date).toLocaleString("it-IT")})`;
  if (!ctx.dryRun) {
    await db.tollTransaction.create({
      data: {
        stationId,
        deviceCode: s(row.deviceCode),
        targa: up(row.targa),
        data: row.data as Date,
        tratta: s(row.tratta),
        importo: row.importo as number,
        importJobId,
      },
    });
  }
  return "ok";
}

export async function processRows(params: {
  entity: string;
  rows: { rowIndex: number; data: Row }[];
  dryRun: boolean;
  importJobId?: string | null;
}): Promise<RowOutcome[]> {
  const ctx = await buildCtx(params.dryRun);
  const outcomes: RowOutcome[] = [];
  for (const { rowIndex, data } of params.rows) {
    try {
      const res = await (() => {
        switch (params.entity) {
          case "vehicles": return commitVehicleRow(data, ctx);
          case "drivers": return commitDriverRow(data, ctx);
          case "services": return commitServiceRow(data, ctx);
          case "fines": return commitFineRow(data, ctx);
          case "leases": return commitLeaseRow(data, ctx);
          case "movements": return commitMovementRow(data, ctx);
          case "replacements": return commitReplacementRow(data, ctx);
          case "fuel": return commitFuelRow(data, ctx, params.importJobId ?? null);
          case "tolls": return commitTollRow(data, ctx, params.importJobId ?? null);
          default: throw new Error(`Entità sconosciuta: ${params.entity}`);
        }
      })();
      if (res === "ok" || (typeof res === "string" && res.startsWith("ok"))) {
        outcomes.push({ rowIndex, status: "ok", message: res === "ok" ? "riga valida" : res });
      } else {
        const isDup = /già presente|già registrata|duplicat/.test(res);
        outcomes.push({ rowIndex, status: isDup ? "duplicate" : "error", message: res });
      }
    } catch (e) {
      outcomes.push({ rowIndex, status: "error", message: e instanceof Error ? e.message : "errore sconosciuto" });
    }
  }
  return outcomes;
}
