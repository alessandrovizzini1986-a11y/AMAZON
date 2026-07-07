"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan, stationScope } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { getConfigNumber } from "@/lib/config";
import { findDriverForFine, scadenzaRicorso, type AssignmentWindow } from "@/domain/fines";

const fineSchema = z.object({
  vehicleId: z.string().min(1),
  verbaleNo: z.string().optional(),
  dataOraInfrazione: z.coerce.date(),
  luogo: z.string().min(2),
  tipoViolazione: z.string().min(3),
  importo: z.coerce.number().min(0),
  puntiPatente: z.coerce.number().int().min(0).default(0),
});

async function assertFineScope(user: Awaited<ReturnType<typeof requireUser>>, vehicleId: string) {
  const vehicle = await db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
  const scope = stationScope(user);
  if (scope.stationId && vehicle.stationId !== scope.stationId) {
    throw new Error("Veicolo di un'altra stazione");
  }
  return vehicle;
}

export async function createFineAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "fine.manage");
  const raw = Object.fromEntries(formData.entries());
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) clean[k] = v === "" ? undefined : v;
  const data = fineSchema.parse(clean);
  const vehicle = await assertFineScope(user, data.vehicleId);

  // assegnazione conducente dai log movimentazione — mai a caso
  const dayStart = new Date(data.dataOraInfrazione);
  dayStart.setHours(0, 0, 0, 0);
  const assignments = await db.assignment.findMany({
    where: { vehicleId: data.vehicleId, date: dayStart },
    include: { driver: true },
  });
  const windows: AssignmentWindow[] = assignments.map((a) => ({
    driverId: a.driverId,
    driverName: `${a.driver.firstName} ${a.driver.lastName}`,
    checkInAt: a.checkInAt,
    checkOutAt: a.checkOutAt,
    date: a.date,
  }));
  const match = findDriverForFine(data.dataOraInfrazione, windows);

  const fine = await db.fine.create({
    data: {
      ...data,
      driverId: match?.driverId ?? null,
      assegnazioneFonte: match?.fonte ?? null,
    },
  });
  await audit({
    userId: user.id,
    action: "fine.create",
    entity: "Fine",
    entityId: fine.id,
    meta: { targa: vehicle.targa, importo: data.importo, assegnazione: match?.fonte ?? "da assegnare" },
  });
  revalidatePath("/fines");
  redirect(`/fines/${fine.id}`);
}

export async function notifyFineAction(fineId: string, formData: FormData) {
  const user = await requireUser();
  assertCan(user, "fine.manage");
  const fine = await db.fine.findUniqueOrThrow({ where: { id: fineId } });
  await assertFineScope(user, fine.vehicleId);

  const dataNotifica = new Date(String(formData.get("dataNotifica")));
  const giorniPrefetto = await getConfigNumber("fine.ricorso.prefetto.giorni");
  await db.fine.update({
    where: { id: fineId },
    data: {
      stato: "NOTIFICATA",
      dataNotifica,
      scadenzaRicorso: scadenzaRicorso(dataNotifica, giorniPrefetto),
    },
  });
  await audit({ userId: user.id, action: "fine.notify", entity: "Fine", entityId: fineId, meta: { dataNotifica: dataNotifica.toISOString() } });
  revalidatePath(`/fines/${fineId}`);
}

export async function assignFineDriverAction(fineId: string, formData: FormData) {
  const user = await requireUser();
  assertCan(user, "fine.manage");
  const fine = await db.fine.findUniqueOrThrow({ where: { id: fineId } });
  await assertFineScope(user, fine.vehicleId);

  const driverId = String(formData.get("driverId"));
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (!motivo) throw new Error("Motivazione obbligatoria per assegnazione manuale");
  const driver = await db.user.findUniqueOrThrow({ where: { id: driverId } });

  await db.fine.update({
    where: { id: fineId },
    data: { driverId, assegnazioneFonte: `manuale: ${motivo}` },
  });
  await audit({
    userId: user.id,
    action: "fine.assignDriver",
    entity: "Fine",
    entityId: fineId,
    meta: { driver: driver.email, motivo, prima: fine.driverId },
  });
  revalidatePath(`/fines/${fineId}`);
}

export async function updateFineStatusAction(fineId: string, formData: FormData) {
  const user = await requireUser();
  assertCan(user, "fine.manage");
  const fine = await db.fine.findUniqueOrThrow({ where: { id: fineId } });
  await assertFineScope(user, fine.vehicleId);

  const stato = String(formData.get("stato")) as "PAGATA" | "RICORSO" | "ANNULLATA";
  const statoRicorso = formData.get("statoRicorso") ? String(formData.get("statoRicorso")) : undefined;
  const noteRicorso = formData.get("noteRicorso") ? String(formData.get("noteRicorso")) : undefined;

  await db.fine.update({
    where: { id: fineId },
    data: {
      stato,
      ...(statoRicorso ? { statoRicorso: statoRicorso as "IN_PREPARAZIONE" | "PRESENTATO" | "ACCOLTO" | "RESPINTO" } : {}),
      ...(noteRicorso !== undefined ? { noteRicorso } : {}),
    },
  });
  await audit({
    userId: user.id,
    action: "fine.updateStatus",
    entity: "Fine",
    entityId: fineId,
    meta: { before: { stato: fine.stato, ricorso: fine.statoRicorso }, after: { stato, ricorso: statoRicorso } },
  });
  revalidatePath(`/fines/${fineId}`);
}

export async function chargebackFineAction(fineId: string, formData: FormData) {
  const user = await requireUser();
  assertCan(user, "fine.manage");
  const fine = await db.fine.findUniqueOrThrow({ where: { id: fineId } });
  await assertFineScope(user, fine.vehicleId);
  if (!fine.driverId) throw new Error("Impossibile riaddebitare: multa non assegnata a un conducente");

  const stato = String(formData.get("riaddebito")) as "DA_ADDEBITARE" | "ADDEBITATO" | "CONTESTATO" | "SALDATO" | "NON_PREVISTO";
  const importoRaw = formData.get("importoRiaddebito");
  const importo = importoRaw ? Number(importoRaw) : Number(fine.importo);

  await db.fine.update({
    where: { id: fineId },
    data: { riaddebito: stato, importoRiaddebito: importo },
  });
  await audit({
    userId: user.id,
    action: "fine.chargeback",
    entity: "Fine",
    entityId: fineId,
    meta: { before: fine.riaddebito, after: stato, importo },
  });
  revalidatePath(`/fines/${fineId}`);
}
