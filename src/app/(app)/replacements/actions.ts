"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan, stationScope } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { giorniScoperti, importoStorno } from "@/domain/replacement";
import { getConfigNumber } from "@/lib/config";

const caseSchema = z.object({
  vehicleId: z.string().min(1),
  motivo: z.enum(["INCIDENTE", "GUASTO", "MANUTENZIONE"]),
  dataIngressoOfficina: z.coerce.date(),
  centroConvenzionato: z.string().min(2),
  note: z.string().optional(),
});

async function assertScopeForVehicle(user: Awaited<ReturnType<typeof requireUser>>, vehicleId: string) {
  const vehicle = await db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
  const scope = stationScope(user);
  if (scope.stationId && vehicle.stationId !== scope.stationId) {
    throw new Error("Veicolo di un'altra stazione");
  }
  return vehicle;
}

export async function createReplacementCaseAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "replacement.manage");
  const raw = Object.fromEntries(formData.entries());
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) clean[k] = v === "" ? undefined : v;
  const data = caseSchema.parse(clean);
  const vehicle = await assertScopeForVehicle(user, data.vehicleId);

  // vincolo anti doppio-storno: una sola pratica per (targa, data ingresso officina)
  const dup = await db.replacementCase.findFirst({
    where: { vehicleId: data.vehicleId, dataIngressoOfficina: data.dataIngressoOfficina },
  });
  if (dup) {
    redirect(`/replacements?error=${encodeURIComponent(`Esiste già una pratica per ${vehicle.targa} con ingresso officina ${data.dataIngressoOfficina.toLocaleDateString("it-IT")}`)}`);
  }

  const rc = await db.replacementCase.create({ data });
  // il veicolo entra in officina
  await db.vehicle.update({ where: { id: data.vehicleId }, data: { stato: "IN_OFFICINA" } });
  await audit({
    userId: user.id,
    action: "replacement.create",
    entity: "ReplacementCase",
    entityId: rc.id,
    meta: { targa: vehicle.targa, motivo: data.motivo, ingresso: data.dataIngressoOfficina.toISOString().slice(0, 10) },
  });
  revalidatePath("/replacements");
  redirect(`/replacements/${rc.id}`);
}

/** Aggiornamento date/sostitutivo — consentito solo su pratica APERTA (poi serve Admin). */
export async function updateReplacementCaseAction(caseId: string, formData: FormData) {
  const user = await requireUser();
  assertCan(user, "replacement.manage");
  const rc = await db.replacementCase.findUniqueOrThrow({ where: { id: caseId }, include: { vehicle: true } });
  await assertScopeForVehicle(user, rc.vehicleId);

  // lock post-invio: solo Admin può modificare, e la modifica è tracciata come override
  if (rc.stato !== "APERTA" && user.role !== "ADMIN") {
    throw new Error("Pratica già inviata alla leasing: modifiche consentite solo all'Admin (con audit)");
  }

  const get = (k: string) => {
    const v = formData.get(k);
    return v === null || v === "" ? null : String(v);
  };
  const replacementVehicleId = get("replacementVehicleId");
  const dataRicezione = get("dataRicezioneSostitutivo");
  const dataRientro = get("dataRientroOriginale");

  const before = {
    replacementVehicleId: rc.replacementVehicleId,
    dataRicezioneSostitutivo: rc.dataRicezioneSostitutivo?.toISOString() ?? null,
    dataRientroOriginale: rc.dataRientroOriginale?.toISOString() ?? null,
  };

  await db.replacementCase.update({
    where: { id: caseId },
    data: {
      replacementVehicleId: replacementVehicleId,
      dataRicezioneSostitutivo: dataRicezione ? new Date(dataRicezione) : null,
      dataRientroOriginale: dataRientro ? new Date(dataRientro) : null,
    },
  });
  // rientro del mezzo originale → torna attivo
  if (dataRientro && rc.vehicle.stato === "IN_OFFICINA") {
    await db.vehicle.update({ where: { id: rc.vehicleId }, data: { stato: "ATTIVO" } });
  }
  await audit({
    userId: user.id,
    action: rc.stato === "APERTA" ? "replacement.update" : "replacement.adminOverride",
    entity: "ReplacementCase",
    entityId: caseId,
    meta: { targa: rc.vehicle.targa, before, lockBypassed: rc.stato !== "APERTA" },
  });
  revalidatePath(`/replacements/${caseId}`);
}

/**
 * Invio alla leasing: congela canone (snapshot), giorni scoperti e importo storno.
 * Da qui la pratica è bloccata per i non-Admin.
 */
export async function sendReplacementCaseAction(caseId: string) {
  const user = await requireUser();
  assertCan(user, "replacement.manage");
  const rc = await db.replacementCase.findUniqueOrThrow({ where: { id: caseId }, include: { vehicle: true } });
  await assertScopeForVehicle(user, rc.vehicleId);
  if (rc.stato !== "APERTA") throw new Error("Pratica già inviata");

  const oggi = new Date();
  const giorni = giorniScoperti({
    dataIngressoOfficina: rc.dataIngressoOfficina,
    dataRicezioneSostitutivo: rc.dataRicezioneSostitutivo,
    dataRientroOriginale: rc.dataRientroOriginale,
    oggi,
  });
  const canone = Number(rc.vehicle.canoneMese ?? 0);
  const giorniConvenzionaliMese = await getConfigNumber("replacement.giorniConvenzionaliMese");
  const storno = importoStorno(giorni, canone, giorniConvenzionaliMese);

  await db.replacementCase.update({
    where: { id: caseId },
    data: {
      stato: "INVIATA",
      inviataAt: oggi,
      canoneMeseSnapshot: canone,
      giorniScoperti: giorni,
      importoStorno: storno,
    },
  });
  await audit({
    userId: user.id,
    action: "replacement.send",
    entity: "ReplacementCase",
    entityId: caseId,
    meta: { targa: rc.vehicle.targa, giorniScoperti: giorni, canoneSnapshot: canone, importoStorno: storno },
  });
  revalidatePath(`/replacements/${caseId}`);
}

export async function updateReplacementStatusAction(caseId: string, formData: FormData) {
  const user = await requireUser();
  assertCan(user, "replacement.manage");
  const rc = await db.replacementCase.findUniqueOrThrow({ where: { id: caseId }, include: { vehicle: true } });
  await assertScopeForVehicle(user, rc.vehicleId);

  const stato = String(formData.get("stato")) as "CONFERMATA" | "CONTESTATA" | "CHIUSA";
  const note = formData.get("note") ? String(formData.get("note")) : undefined;
  if (rc.stato === "APERTA") throw new Error("Inviare prima la pratica alla leasing");

  await db.replacementCase.update({
    where: { id: caseId },
    data: { stato, ...(note !== undefined ? { note } : {}) },
  });
  await audit({
    userId: user.id,
    action: "replacement.updateStatus",
    entity: "ReplacementCase",
    entityId: caseId,
    meta: { targa: rc.vehicle.targa, before: rc.stato, after: stato },
  });
  revalidatePath(`/replacements/${caseId}`);
}
