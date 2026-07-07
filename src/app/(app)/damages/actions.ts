"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan, stationScope } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { saveUpload } from "@/lib/uploads";

export async function createDamageAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "damage.report");

  const vehicleId = String(formData.get("vehicleId"));
  const tipo = String(formData.get("tipo")).trim();
  const descrizione = String(formData.get("descrizione") ?? "").trim() || null;
  if (!vehicleId || !tipo) throw new Error("Veicolo e tipo danno obbligatori");

  const vehicle = await db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
  const foto = formData.get("foto") as File | null;
  const fotoUrl = foto && foto.size > 0 ? await saveUpload(foto, "damage") : null;

  const damage = await db.damage.create({
    data: {
      vehicleId,
      tipo,
      data: new Date(),
      descrizione,
      fotoUrl,
      responsabilita: "IGNOTO",
      reporterId: user.id,
    },
  });
  await audit({
    userId: user.id,
    action: "damage.create",
    entity: "Damage",
    entityId: damage.id,
    meta: { targa: vehicle.targa, tipo },
  });
  revalidatePath("/damages");
  redirect(user.role === "DRIVER" ? "/driver?segnalato=1" : "/damages");
}

export async function updateDamageAction(damageId: string, formData: FormData) {
  const user = await requireUser();
  assertCan(user, "vehicle.manage");
  const damage = await db.damage.findUniqueOrThrow({ where: { id: damageId }, include: { vehicle: true } });
  const scope = stationScope(user);
  if (scope.stationId && damage.vehicle.stationId !== scope.stationId) throw new Error("Danno di un'altra stazione");

  const get = (k: string) => {
    const v = formData.get(k);
    return v === null || v === "" ? null : String(v);
  };
  await db.damage.update({
    where: { id: damageId },
    data: {
      responsabilita: (get("responsabilita") ?? "IGNOTO") as "DRIVER" | "TERZI" | "IGNOTO",
      centroRiparazione: get("centroRiparazione"),
      praticaAssicurativa: get("praticaAssicurativa"),
      costoStimato: get("costoStimato") ? Number(get("costoStimato")) : null,
      chiuso: formData.get("chiuso") === "on",
    },
  });
  await audit({
    userId: user.id,
    action: "damage.update",
    entity: "Damage",
    entityId: damageId,
    meta: { targa: damage.vehicle.targa, before: { responsabilita: damage.responsabilita, chiuso: damage.chiuso } },
  });
  revalidatePath("/damages");
}
