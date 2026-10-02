import "server-only";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { normalizeModello, normalizeLeasingCompany } from "@/domain/vehicleNames";
import type { Role, VehicleStatus, FuelType, ContractType } from "@prisma/client";

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
        modello: normalizeModello(s(row.modello)!),
        allestimento: s(row.allestimento),
        alimentazione: (row.alimentazione as FuelType) ?? "DIESEL",
        hvoCompatibile: row.hvoCompatibile === true || row.alimentazione === "DIESEL_HVO",
        immatricolazione: (row.immatricolazione as Date) ?? null,
        stationId,
        stato: (row.stato as VehicleStatus) ?? "ATTIVO",
        kmAttuali: (row.kmAttuali as number) ?? 0,
        canoneMese: (row.canoneMese as number) ?? null,
        franchigiaDanni: (row.franchigiaDanni as number) ?? null,
        leasingCompany: normalizeLeasingCompany(s(row.leasingCompany)),
        contrattoLeasingNo: s(row.contrattoLeasingNo),
        tipoContratto: (row.tipoContratto as ContractType) ?? null,
        contrattoDataInizio: (row.contrattoDataInizio as Date) ?? null,
        contrattoDataFine: (row.contrattoDataFine as Date) ?? null,
        note: s(row.note),
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

async function commitLeaseRow(row: Row, ctx: Ctx): Promise<RowOutcome["status"] | string> {
  const vehicleId = ctx.vehicleByTarga.get(up(row.targa)!);
  if (!vehicleId) return `veicolo con targa ${row.targa} inesistente`;
  if (!ctx.dryRun && vehicleId !== "dry-run") {
    await db.vehicle.update({
      where: { id: vehicleId },
      data: {
        canoneMese: row.canoneMese as number,
        leasingCompany: normalizeLeasingCompany(s(row.leasingCompany)),
        contrattoLeasingNo: s(row.contrattoLeasingNo),
        franchigiaDanni: (row.franchigiaDanni as number) ?? undefined,
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
          case "leases": return commitLeaseRow(data, ctx);
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
