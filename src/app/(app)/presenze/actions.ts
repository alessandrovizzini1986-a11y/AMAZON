"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { STATIONS } from "@/domain/presenze/regole";
import { fondiRichieste, type Stato } from "@/domain/presenze/verifica";

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

const meseRe = z.string().regex(/^\d{4}-\d{2}$/);
const statoRichiesta = z.enum(["DA_FARE", "RICHIESTA", "OK", "RISOLTA"]);
const richiesta = z.object({
  chiave: z.string().min(5).max(300), mese: meseRe, station, pop: z.string().max(20), driver: z.string().max(200), tipo: z.string().max(20),
  rif: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), periodo: z.string().max(30), testo: z.string().max(1000),
});
export type RichiestaVista = { chiave: string; mese: string; station: string; pop: string; driver: string; tipo: string; rif: string; periodo: string; testo: string; stato: Stato; nota: string; aggiornataIl: string; aggiornataDa: string | null };

const vista = (r: { chiave: string; mese: string; station: string; pop: string; driver: string; tipo: string; rif: string; periodo: string; testo: string; stato: string; nota: string | null; aggiornataIl: Date; aggiornataDa: string | null }): RichiestaVista =>
  ({ ...r, stato: r.stato as Stato, nota: r.nota ?? "", aggiornataIl: r.aggiornataIl.toISOString() });

/** Richieste salvate di un mese (per riaprire la pagina senza rifare il controllo). */
export async function richiesteDelMese(mese: string): Promise<RichiestaVista[]> {
  const user = await requireUser();
  assertCan(user, "presenze.view");
  return (await db.presenzeRichiesta.findMany({ where: { mese: meseRe.parse(mese) }, orderBy: [{ station: "asc" }, { driver: "asc" }, { rif: "asc" }] })).map(vista);
}

/**
 * Salva l'esito di una verifica: le richieste nuove nascono "da chiedere", quelle già note tengono lo stato,
 * quelle sparite dal controllo (tracking corretto) diventano "sparita da sola". Regole: fondiRichieste.
 */
export async function sincronizzaRichieste(input: { mese: string; stations: string[]; trovate: z.infer<typeof richiesta>[] }): Promise<{ nuove: number; riaperte: number; sparite: number; richieste: RichiestaVista[] }> {
  const user = await requireUser();
  assertCan(user, "presenze.run");
  const mese = meseRe.parse(input.mese), stations = z.array(station).max(7).parse(input.stations);
  const trovate = z.array(richiesta).max(20000).parse(input.trovate).filter((t) => t.mese === mese);
  const salvate = await db.presenzeRichiesta.findMany({ where: { mese }, select: { chiave: true, stato: true, testo: true } });
  const f = fondiRichieste(salvate.map((s) => ({ ...s, stato: s.stato as Stato })), trovate as never, stations, mese);
  await db.$transaction(async (tx) => {
    if (f.crea.length) await tx.presenzeRichiesta.createMany({ data: f.crea.map((c) => ({ ...c, aggiornataDa: user.name })), skipDuplicates: true });
    for (const a of f.aggiorna) await tx.presenzeRichiesta.update({ where: { chiave: a.chiave }, data: { stato: a.stato, testo: a.testo, ...(a.riaperta ? { nota: "riaperta: i dati sono cambiati" } : {}) } });
  }, { timeout: 60_000 });
  const sparite = f.aggiorna.filter((a) => a.stato === "RISOLTA").length, riaperte = f.aggiorna.filter((a) => a.riaperta).length;
  await audit({ userId: user.id, action: "presenze.verifica", entity: "PresenzeRichiesta", meta: { mese, stations, trovate: trovate.length, nuove: f.crea.length, riaperte, sparite } });
  revalidatePath("/presenze/verifica");
  return { nuove: f.crea.length, riaperte, sparite, richieste: await richiesteDelMese(mese) };
}

/** Cambia stato e nota di una o più richieste (dalla pagina o dall'Excel ricaricato). */
export async function aggiornaRichieste(items: { chiave: string; stato: string; nota?: string }[]): Promise<{ ok: number }> {
  const user = await requireUser();
  assertCan(user, "presenze.run");
  const xs = z.array(z.object({ chiave: z.string().min(5).max(300), stato: statoRichiesta, nota: z.string().max(500).optional() })).max(20000).parse(items);
  let ok = 0;
  await db.$transaction(async (tx) => {
    for (const x of xs) ok += (await tx.presenzeRichiesta.updateMany({ where: { chiave: x.chiave }, data: { stato: x.stato, ...(x.nota !== undefined ? { nota: x.nota.trim() || null } : {}), aggiornataDa: user.name } })).count;
  }, { timeout: 60_000 });
  await audit({ userId: user.id, action: "presenze.richieste", entity: "PresenzeRichiesta", meta: { righe: ok, stati: [...new Set(xs.map((x) => x.stato))] } });
  revalidatePath("/presenze/verifica");
  return { ok };
}
