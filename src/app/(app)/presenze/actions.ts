"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { STATIONS } from "@/domain/presenze/regole";

const station = z.enum(STATIONS);

const fileMeta = z.object({
  tipo: z.enum(["TRACKING_SIC", "TRACKING_STD", "FLEX_CSV", "ZUCCHETTI"]),
  station,
  anno: z.number().int().min(2020).max(2100),
  mese: z.number().int().min(1).max(12),
  giorno: z.number().int().min(0).max(31),
  nomeFile: z.string().min(1).max(300),
  hashSha256: z.string().regex(/^[0-9a-f]{64}$/),
  righe: z.number().int().min(0),
});
export type FileMeta = z.infer<typeof fileMeta>;

/** Registra i metadati dei file caricati nell'archivio (i file restano nel browser). */
export async function registraFile(items: FileMeta[]): Promise<{ ok: number }> {
  const user = await requireUser();
  assertCan(user, "presenze.run");
  const parsed = z.array(fileMeta).max(5000).parse(items);
  for (const m of parsed) {
    await db.presenzeFile.upsert({
      where: { tipo_hashSha256_station_anno_mese_giorno: { tipo: m.tipo, hashSha256: m.hashSha256, station: m.station, anno: m.anno, mese: m.mese, giorno: m.giorno } },
      create: { ...m, caricatoDaId: user.id, caricatoDa: user.name },
      update: { nomeFile: m.nomeFile, righe: m.righe, caricatoDaId: user.id, caricatoDa: user.name, caricatoIl: new Date() },
    });
  }
  const files = [...new Set(parsed.map((m) => m.nomeFile))];
  await audit({ userId: user.id, action: "presenze.file", entity: "PresenzeFile", meta: { file: files.slice(0, 50), righe: parsed.length } });
  revalidatePath("/presenze/archivio");
  return { ok: parsed.length };
}

const risultato = z.object({
  station, tipo: z.string().max(20), driver: z.string().max(200), driverId: z.string().max(100),
  categoria: z.string().max(20), giorni: z.array(z.unknown()).max(62), oreTracking: z.number(),
  trasferte: z.number().int(), rotte: z.number().int(), nota: z.string().max(2000),
});
const run = z.object({
  tipo: z.enum(["SETTIMANALE", "FINE_MESE"]),
  station: station.nullable(),
  periodoDa: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodoA: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  riepilogo: z.unknown(),
  risultati: z.array(risultato).max(5000),
});
export type RunInput = z.infer<typeof run>;

/** Salva un'esecuzione: riepilogo + una riga per driver e categoria di anomalia. */
export async function salvaEsecuzione(input: RunInput): Promise<{ id: string }> {
  const user = await requireUser();
  assertCan(user, "presenze.run");
  const r = run.parse(input);
  const created = await db.presenzeRun.create({
    data: {
      tipo: r.tipo, station: r.station, periodoDa: new Date(r.periodoDa + "T00:00:00Z"), periodoA: new Date(r.periodoA + "T00:00:00Z"),
      eseguitoDaId: user.id, eseguitoDa: user.name, riepilogoJson: (r.riepilogo ?? {}) as object, nAlert: r.risultati.length,
      risultati: { create: r.risultati.map((x) => ({ ...x, giorni: x.giorni as object[] })) },
    },
  });
  await audit({ userId: user.id, action: "presenze.run", entity: "PresenzeRun", entityId: created.id, meta: { tipo: r.tipo, station: r.station, da: r.periodoDa, a: r.periodoA, alert: r.risultati.length } });
  revalidatePath("/presenze/settimanale");
  revalidatePath("/presenze/fine-mese");
  return { id: created.id };
}

/** Esito della verifica con gli Ops su una riga salvata. */
export async function aggiornaEsitoOps(id: string, esitoOps: string, notaOps: string): Promise<void> {
  const user = await requireUser();
  assertCan(user, "presenze.run");
  const esito = z.enum(["aperto", "chiuso", "giustificato"]).parse(esitoOps);
  const nota = z.string().max(2000).parse(notaOps).trim();
  const r = await db.presenzeRisultato.update({ where: { id }, data: { esitoOps: esito, notaOps: nota || null, aggiornatoIl: new Date() } });
  await audit({ userId: user.id, action: "presenze.esitoOps", entity: "PresenzeRisultato", entityId: id, meta: { esito, nota } });
  revalidatePath(`/presenze/esecuzioni/${r.runId}`);
}
