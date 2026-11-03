"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const PATH = "/fatture-amazon/forecast";

/** Registra il file (sha256 univoco: lo stesso file non si carica due volte). */
export async function creaForecastFile(input: { nome: string; sha256: string; linea: "ND" | "SD" }): Promise<{ id: string } | { errore: string }> {
  const user = await requireUser();
  assertCan(user, "forecast.import");
  const f = z.object({ nome: z.string().min(1).max(200), sha256: z.string().regex(/^[0-9a-f]{64}$/), linea: z.enum(["ND", "SD"]) }).parse(input);
  const gia = await db.forecastFile.findUnique({ where: { sha256: f.sha256 } });
  if (gia) return { errore: `questo file è già stato caricato il ${gia.caricatoIl.toLocaleString("it-IT", { timeZone: "Europe/Rome" })} come ${gia.nome}` };
  const r = await db.forecastFile.create({ data: { ...f, caricatoDaId: user.id } });
  return { id: r.id };
}

const riga = z.object({ week: z.number().int(), data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), station: z.string().min(1).max(10), cycle: z.string().max(40), serviceType: z.string().max(120), routes: z.number().int(), classe: z.string().max(30) });

export async function aggiungiRigheForecast(fileId: string, righe: z.infer<typeof riga>[]) {
  const user = await requireUser();
  assertCan(user, "forecast.import");
  const r = z.array(riga).max(500).parse(righe);
  await db.forecastFile.findUniqueOrThrow({ where: { id: fileId } });
  await db.forecastRoute.createMany({ data: r.map((x) => ({ ...x, fileId, data: new Date(x.data + "T00:00:00Z") })) });
  return { ok: r.length };
}

export async function concludiForecast(fileId: string, c: { righe: number; nonMappate: number; settimane: number[] }) {
  const user = await requireUser();
  assertCan(user, "forecast.import");
  const f = await db.forecastFile.findUniqueOrThrow({ where: { id: fileId } });
  await audit({ userId: user.id, action: "forecast.import", entity: "ForecastFile", entityId: fileId, meta: { nome: f.nome, linea: f.linea, ...c } });
  revalidatePath(PATH);
}

const regola = z.object({ serviceType: z.string().trim().min(1).max(120), cycle: z.string().trim().min(1).max(40), station: z.string().trim().min(1).max(10), classe: z.string().trim().regex(/^(ND|SD)_[A-Z]+$/) });

export async function salvaRegolaMappa(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "forecast.import");
  const r = regola.parse({ serviceType: formData.get("serviceType"), cycle: formData.get("cycle") || "*", station: formData.get("station") || "*", classe: formData.get("classe") });
  await db.forecastClasseMap.upsert({ where: { serviceType_cycle_station: { serviceType: r.serviceType, cycle: r.cycle, station: r.station } }, create: r, update: { classe: r.classe } });
  await audit({ userId: user.id, action: "forecast.mappa.salva", entity: "ForecastClasseMap", meta: r });
  revalidatePath(PATH);
}

export async function eliminaRegolaMappa(id: string) {
  const user = await requireUser();
  assertCan(user, "forecast.import");
  const r = await db.forecastClasseMap.delete({ where: { id } });
  await audit({ userId: user.id, action: "forecast.mappa.elimina", entity: "ForecastClasseMap", entityId: id, meta: r });
  revalidatePath(PATH);
}
