"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan, stationScope } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { normalizeModello, normalizeLeasingCompany } from "@/domain/vehicleNames";

const vehicleSchema = z.object({
  targa: z.string().min(5).transform((v) => v.toUpperCase().replace(/\s/g, "")),
  modello: z.string().min(2),
  allestimento: z.string().optional(),
  alimentazione: z.enum(["DIESEL", "DIESEL_HVO", "BENZINA", "ELETTRICO", "METANO", "GPL", "IBRIDO"]).default("DIESEL"),
  hvoCompatibile: z.coerce.boolean().optional(),
  immatricolazione: z.coerce.date().optional().nullable(),
  stationId: z.string().min(1),
  stato: z.enum(["ATTIVO", "IN_OFFICINA", "SOSTITUTIVO", "UFFICIO", "DISMESSO"]).default("ATTIVO"),
  kmAttuali: z.coerce.number().int().min(0).default(0),
  canoneMese: z.coerce.number().min(0).optional().nullable(),
  franchigiaDanni: z.coerce.number().min(0).optional().nullable(),
  leasingCompany: z.string().optional(),
  contrattoLeasingNo: z.string().optional(),
  tipoContratto: z.enum(["MT", "LT", "BT", "SOST", "UFFICIO"]).optional().nullable(),
  contrattoDataInizio: z.coerce.date().optional().nullable(),
  contrattoDataFine: z.coerce.date().optional().nullable(),
  note: z.string().optional(),
  prossimoTagliandoData: z.coerce.date().optional().nullable(),
  prossimoTagliandoKm: z.coerce.number().int().optional().nullable(),
  prossimaRevisione: z.coerce.date().optional().nullable(),
});

function parseVehicleForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    clean[k] = v === "" ? undefined : v;
  }
  const data = vehicleSchema.parse(clean);
  data.modello = normalizeModello(data.modello);
  data.leasingCompany = normalizeLeasingCompany(data.leasingCompany) ?? undefined;
  return data;
}

export async function createVehicleAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "vehicle.manage");
  const data = parseVehicleForm(formData);

  // il responsabile mezzi crea solo nella propria stazione
  const scope = stationScope(user);
  if (scope.stationId && data.stationId !== scope.stationId) {
    throw new Error("Non puoi creare veicoli in un'altra stazione");
  }

  const existing = await db.vehicle.findFirst({
    where: { targa: data.targa, stato: { not: "DISMESSO" } },
  });
  if (existing) redirect(`/vehicles?error=${encodeURIComponent(`Targa ${data.targa} già presente tra i veicoli attivi`)}`);

  const vehicle = await db.vehicle.create({
    data: {
      ...data,
      stationHistory: { create: { stationId: data.stationId, fromDate: new Date(), note: "inserimento manuale" } },
    },
  });
  await audit({ userId: user.id, action: "vehicle.create", entity: "Vehicle", entityId: vehicle.id, meta: { targa: data.targa } });
  revalidatePath("/vehicles");
  redirect(`/vehicles/${vehicle.id}`);
}

export async function updateVehicleAction(vehicleId: string, formData: FormData) {
  const user = await requireUser();
  assertCan(user, "vehicle.manage");
  const before = await db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });

  const scope = stationScope(user);
  if (scope.stationId && before.stationId !== scope.stationId) {
    throw new Error("Veicolo di un'altra stazione");
  }

  const data = parseVehicleForm(formData);
  // il cambio stazione passa dal modulo movimentazione (con approvazione), non da qui
  data.stationId = before.stationId;

  await db.vehicle.update({ where: { id: vehicleId }, data });
  await audit({
    userId: user.id,
    action: "vehicle.update",
    entity: "Vehicle",
    entityId: vehicleId,
    meta: {
      before: { stato: before.stato, kmAttuali: before.kmAttuali, canoneMese: before.canoneMese ? String(before.canoneMese) : null },
      after: { stato: data.stato, kmAttuali: data.kmAttuali, canoneMese: data.canoneMese ? String(data.canoneMese) : null },
    },
  });
  revalidatePath(`/vehicles/${vehicleId}`);
  redirect(`/vehicles/${vehicleId}`);
}
