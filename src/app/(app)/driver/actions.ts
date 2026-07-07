"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { saveUpload } from "@/lib/uploads";

export async function checkInAction(assignmentId: string, formData: FormData) {
  const user = await requireUser();
  assertCan(user, "checkinout.perform");

  const assignment = await db.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { vehicle: true },
  });
  if (user.role === "DRIVER" && assignment.driverId !== user.id) {
    throw new Error("Assegnazione di un altro driver");
  }
  if (assignment.checkInAt) throw new Error("Check-in già effettuato");

  const km = Number(formData.get("km"));
  if (!Number.isFinite(km) || km < 0) throw new Error("Km non validi");
  const note = String(formData.get("note") ?? "").trim() || null;
  const foto = formData.get("foto") as File | null;
  const fotoPath = foto && foto.size > 0 ? await saveUpload(foto, "checkin") : null;

  await db.assignment.update({
    where: { id: assignmentId },
    data: { checkInAt: new Date(), checkInKm: km, checkInNote: note, checkInFoto: fotoPath },
  });
  await audit({
    userId: user.id,
    action: "assignment.checkIn",
    entity: "Assignment",
    entityId: assignmentId,
    meta: { targa: assignment.vehicle.targa, km },
  });
  revalidatePath("/driver");
  revalidatePath("/movements");
}

export async function checkOutAction(assignmentId: string, formData: FormData) {
  const user = await requireUser();
  assertCan(user, "checkinout.perform");

  const assignment = await db.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { vehicle: true },
  });
  if (user.role === "DRIVER" && assignment.driverId !== user.id) {
    throw new Error("Assegnazione di un altro driver");
  }
  if (!assignment.checkInAt) throw new Error("Check-in non ancora effettuato");
  if (assignment.checkOutAt) throw new Error("Check-out già effettuato");

  const km = Number(formData.get("km"));
  if (!Number.isFinite(km) || km < (assignment.checkInKm ?? 0)) {
    throw new Error("Km check-out inferiori ai km di check-in");
  }
  const danni = String(formData.get("danni") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const foto = formData.get("foto") as File | null;
  const fotoPath = foto && foto.size > 0 ? await saveUpload(foto, "checkout") : null;

  await db.assignment.update({
    where: { id: assignmentId },
    data: { checkOutAt: new Date(), checkOutKm: km, checkOutNote: note, checkOutFoto: fotoPath, danniRilevati: danni },
  });
  // aggiorna km del veicolo
  await db.vehicle.update({
    where: { id: assignment.vehicleId },
    data: { kmAttuali: Math.max(assignment.vehicle.kmAttuali, km) },
  });
  // danno segnalato al check-out → apre automaticamente una segnalazione danno
  if (danni) {
    const damage = await db.damage.create({
      data: {
        vehicleId: assignment.vehicleId,
        tipo: "Segnalazione da check-out",
        data: new Date(),
        descrizione: danni,
        fotoUrl: fotoPath,
        responsabilita: "IGNOTO",
        reporterId: user.id,
      },
    });
    await audit({ userId: user.id, action: "damage.autoCreate", entity: "Damage", entityId: damage.id, meta: { targa: assignment.vehicle.targa, from: "checkout" } });
  }
  await audit({
    userId: user.id,
    action: "assignment.checkOut",
    entity: "Assignment",
    entityId: assignmentId,
    meta: { targa: assignment.vehicle.targa, km, danni },
  });
  revalidatePath("/driver");
  revalidatePath("/movements");
}
