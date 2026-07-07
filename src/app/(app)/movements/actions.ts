"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan, stationScope } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function createAssignmentAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "vehicle.manage");

  const vehicleId = String(formData.get("vehicleId"));
  const driverId = String(formData.get("driverId"));
  const date = new Date(String(formData.get("date")));
  date.setHours(0, 0, 0, 0);

  const vehicle = await db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
  const scope = stationScope(user);
  if (scope.stationId && vehicle.stationId !== scope.stationId) {
    throw new Error("Veicolo di un'altra stazione");
  }

  const existing = await db.assignment.findFirst({ where: { vehicleId, date } });
  if (existing) {
    redirect(`/movements?error=${encodeURIComponent(`${vehicle.targa} è già assegnato per quella data`)}`);
  }

  const assignment = await db.assignment.create({
    data: { date, vehicleId, driverId, stationId: vehicle.stationId },
  });
  await audit({
    userId: user.id,
    action: "assignment.create",
    entity: "Assignment",
    entityId: assignment.id,
    meta: { targa: vehicle.targa, driverId, date: date.toISOString().slice(0, 10) },
  });
  revalidatePath("/movements");
  redirect("/movements");
}

export async function requestTransferAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "transfer.request");

  const vehicleId = String(formData.get("vehicleId"));
  const toStationId = String(formData.get("toStationId"));
  const motivo = String(formData.get("motivo") ?? "").trim() || null;

  const vehicle = await db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
  const scope = stationScope(user);
  if (scope.stationId && vehicle.stationId !== scope.stationId) {
    throw new Error("Veicolo di un'altra stazione");
  }
  if (vehicle.stationId === toStationId) throw new Error("Stazione di destinazione uguale a quella attuale");

  // admin: approvazione implicita ed esecuzione immediata
  const isAdmin = user.role === "ADMIN";
  const transfer = await db.stationTransfer.create({
    data: {
      vehicleId,
      fromStationId: vehicle.stationId,
      toStationId,
      motivo,
      requestedById: user.id,
      status: isAdmin ? "APPROVATO" : "RICHIESTO",
      approvedById: isAdmin ? user.id : null,
    },
  });
  await audit({
    userId: user.id,
    action: "transfer.request",
    entity: "StationTransfer",
    entityId: transfer.id,
    meta: { targa: vehicle.targa, to: toStationId, autoApproved: isAdmin },
  });
  if (isAdmin) await executeTransfer(transfer.id, user.id);
  revalidatePath("/movements");
  redirect("/movements");
}

async function executeTransfer(transferId: string, userId: string) {
  const transfer = await db.stationTransfer.findUniqueOrThrow({
    where: { id: transferId },
    include: { vehicle: true },
  });
  const now = new Date();
  await db.$transaction([
    db.vehicleStationHistory.updateMany({
      where: { vehicleId: transfer.vehicleId, toDate: null },
      data: { toDate: now },
    }),
    db.vehicleStationHistory.create({
      data: {
        vehicleId: transfer.vehicleId,
        stationId: transfer.toStationId,
        fromDate: now,
        note: `trasferimento ${transfer.motivo ? `(${transfer.motivo})` : ""}`.trim(),
      },
    }),
    db.vehicle.update({ where: { id: transfer.vehicleId }, data: { stationId: transfer.toStationId } }),
    db.stationTransfer.update({
      where: { id: transferId },
      data: { status: "COMPLETATO", resolvedAt: now },
    }),
  ]);
  await audit({
    userId,
    action: "transfer.execute",
    entity: "StationTransfer",
    entityId: transferId,
    meta: { targa: transfer.vehicle.targa, from: transfer.fromStationId, to: transfer.toStationId },
  });
}

export async function resolveTransferAction(transferId: string, formData: FormData) {
  const user = await requireUser();
  assertCan(user, "transfer.approve");

  const decision = String(formData.get("decision")); // approve | reject
  const transfer = await db.stationTransfer.findUniqueOrThrow({ where: { id: transferId } });
  if (transfer.status !== "RICHIESTO") throw new Error("Richiesta già gestita");

  if (decision === "reject") {
    await db.stationTransfer.update({
      where: { id: transferId },
      data: { status: "RIFIUTATO", approvedById: user.id, resolvedAt: new Date() },
    });
    await audit({ userId: user.id, action: "transfer.reject", entity: "StationTransfer", entityId: transferId });
  } else {
    await db.stationTransfer.update({
      where: { id: transferId },
      data: { status: "APPROVATO", approvedById: user.id },
    });
    await audit({ userId: user.id, action: "transfer.approve", entity: "StationTransfer", entityId: transferId });
    await executeTransfer(transferId, user.id);
  }
  revalidatePath("/movements");
}
