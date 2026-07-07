"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan, stationScope } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const serviceSchema = z.object({
  vehicleId: z.string().min(1),
  tipo: z.enum(["TAGLIANDO", "REVISIONE", "RIPARAZIONE", "GOMME", "CARROZZERIA", "ALTRO"]),
  officina: z.string().min(2),
  data: z.coerce.date(),
  kmIntervento: z.coerce.number().int().min(0),
  costo: z.coerce.number().min(0),
  descrizione: z.string().optional(),
  // aggiornamento scadenzario contestuale (opzionale)
  prossimoTagliandoData: z.coerce.date().optional().nullable(),
  prossimoTagliandoKm: z.coerce.number().int().optional().nullable(),
  prossimaRevisione: z.coerce.date().optional().nullable(),
});

export async function createServiceRecordAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "maintenance.manage");

  const raw = Object.fromEntries(formData.entries());
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) clean[k] = v === "" ? undefined : v;
  const data = serviceSchema.parse(clean);

  const vehicle = await db.vehicle.findUniqueOrThrow({ where: { id: data.vehicleId } });
  const scope = stationScope(user);
  if (scope.stationId && vehicle.stationId !== scope.stationId) {
    throw new Error("Veicolo di un'altra stazione");
  }

  const record = await db.serviceRecord.create({
    data: {
      vehicleId: data.vehicleId,
      tipo: data.tipo,
      officina: data.officina,
      data: data.data,
      kmIntervento: data.kmIntervento,
      costo: data.costo,
      descrizione: data.descrizione,
    },
  });

  // aggiorna il veicolo: km (se maggiori) e scadenzario se indicato
  await db.vehicle.update({
    where: { id: data.vehicleId },
    data: {
      kmAttuali: Math.max(vehicle.kmAttuali, data.kmIntervento),
      ...(data.prossimoTagliandoData ? { prossimoTagliandoData: data.prossimoTagliandoData } : {}),
      ...(data.prossimoTagliandoKm ? { prossimoTagliandoKm: data.prossimoTagliandoKm } : {}),
      ...(data.prossimaRevisione ? { prossimaRevisione: data.prossimaRevisione } : {}),
    },
  });

  await audit({
    userId: user.id,
    action: "service.create",
    entity: "ServiceRecord",
    entityId: record.id,
    meta: { targa: vehicle.targa, tipo: data.tipo, costo: data.costo, km: data.kmIntervento },
  });

  revalidatePath("/maintenance");
  redirect(`/vehicles/${data.vehicleId}`);
}
