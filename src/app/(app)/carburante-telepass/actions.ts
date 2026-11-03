"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { confrontaImport, type EsitoImport } from "@/domain/telepass/anagrafiche";

const BASE = "/carburante-telepass";
const s = (max = 200) => z.string().max(max).nullable();
const file = z.object({ nomeFile: z.string().min(1).max(300), hash: z.string().regex(/^[0-9a-f]{64}$/) });

const dispositivo = z.object({ codice: z.string().min(1).max(40), station: z.string().max(80), targa: s(40), progetto: s(80), check: s(40) });
const carta = z.object({
  pan: z.string().min(1).max(40), numeroCarta: s(40), identificativo: s(40), targa: s(40), bloccata: s(20),
  dataBlocco: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), centroCosto: s(40), appalto: s(20), ds: s(40), ordine: z.number().int(),
});

export type RisultatoImport = EsitoImport & { esempi: { chiave: string; esito: string; cambi: string[] }[] };

/** Import della mappa Telepass: upsert per codice, i dispositivi assenti dal file restano segnati "non più nel file". */
export async function importaDispositivi(input: { nomeFile: string; hash: string; righe: z.infer<typeof dispositivo>[] }): Promise<RisultatoImport> {
  const user = await requireUser();
  assertCan(user, "telepass.anagrafiche");
  const f = file.parse(input);
  const righe = z.array(dispositivo).max(20000).parse(input.righe);
  const attuali = await db.telepassDispositivo.findMany();
  const campi = ["station", "targa", "progetto", "check"] as const;
  const esito = confrontaImport(attuali, righe, "codice", [...campi]);
  const per = new Map(righe.map((r) => [r.codice, r]));
  await db.$transaction(async (tx) => {
    const nuovi = esito.dettaglio.filter((d) => d.esito === "nuovo").map((d) => ({ ...per.get(d.chiave)!, aggiornatoDa: user.name }));
    if (nuovi.length) await tx.telepassDispositivo.createMany({ data: nuovi });
    for (const d of esito.dettaglio.filter((x) => x.esito === "aggiornato")) {
      const { codice, ...dati } = per.get(d.chiave)!;
      await tx.telepassDispositivo.update({ where: { codice }, data: { ...dati, nonPiuInFile: false, aggiornatoDa: user.name } });
    }
    const spariti = esito.dettaglio.filter((x) => x.esito === "sparito").map((x) => x.chiave);
    if (spariti.length) await tx.telepassDispositivo.updateMany({ where: { codice: { in: spariti } }, data: { nonPiuInFile: true } });
    await tx.anagraficaImport.create({ data: { tipo: "TELEPASS", nomeFile: f.nomeFile, hashSha256: f.hash, righe: righe.length, nuovi: esito.nuovi, aggiornati: esito.aggiornati, invariati: esito.invariati, spariti: esito.spariti, eseguitoDa: user.name } });
  }, { timeout: 60_000 });
  await audit({ userId: user.id, action: "telepass.import", entity: "TelepassDispositivo", meta: { file: f.nomeFile, righe: righe.length, nuovi: esito.nuovi, aggiornati: esito.aggiornati, spariti: esito.spariti } });
  revalidatePath(BASE, "layout");
  const { dettaglio, ...conteggi } = esito;
  return { ...conteggi, esempi: dettaglio.filter((d) => d.esito !== "invariato").slice(0, 200) };
}

/** Import del censimento fuel card: upsert per PAN, stesse regole. */
export async function importaCarte(input: { nomeFile: string; hash: string; righe: z.infer<typeof carta>[] }): Promise<RisultatoImport> {
  const user = await requireUser();
  assertCan(user, "telepass.anagrafiche");
  const f = file.parse(input);
  const righe = z.array(carta).max(20000).parse(input.righe);
  const attuali = (await db.cartaCarburante.findMany()).map((c) => ({ ...c, dataBlocco: c.dataBlocco ? c.dataBlocco.toISOString().slice(0, 10) : null }));
  const campi = ["numeroCarta", "identificativo", "targa", "bloccata", "dataBlocco", "centroCosto", "appalto", "ds"] as const;
  const esito = confrontaImport(attuali, righe, "pan", [...campi]);
  const per = new Map(righe.map((r) => [r.pan, r]));
  const aDb = (r: z.infer<typeof carta>) => ({ ...r, dataBlocco: r.dataBlocco ? new Date(r.dataBlocco + "T00:00:00Z") : null });
  await db.$transaction(async (tx) => {
    const nuovi = esito.dettaglio.filter((d) => d.esito === "nuovo").map((d) => ({ ...aDb(per.get(d.chiave)!), aggiornatoDa: user.name }));
    if (nuovi.length) await tx.cartaCarburante.createMany({ data: nuovi });
    for (const d of esito.dettaglio.filter((x) => x.esito === "aggiornato")) {
      const { pan, ...dati } = aDb(per.get(d.chiave)!);
      await tx.cartaCarburante.update({ where: { pan }, data: { ...dati, nonPiuInFile: false, aggiornatoDa: user.name } });
    }
    // l'ordine nel file serve all'abbinamento per Identificativo: va aggiornato anche sulle carte invariate
    const ordini = esito.dettaglio.filter((x) => x.esito === "invariato").map((x) => per.get(x.chiave)!);
    const att = new Map(attuali.map((a) => [a.pan, a.ordine]));
    for (const r of ordini) if (att.get(r.pan) !== r.ordine) await tx.cartaCarburante.update({ where: { pan: r.pan }, data: { ordine: r.ordine } });
    const spariti = esito.dettaglio.filter((x) => x.esito === "sparito").map((x) => x.chiave);
    if (spariti.length) await tx.cartaCarburante.updateMany({ where: { pan: { in: spariti } }, data: { nonPiuInFile: true } });
    await tx.anagraficaImport.create({ data: { tipo: "FUELCARD", nomeFile: f.nomeFile, hashSha256: f.hash, righe: righe.length, nuovi: esito.nuovi, aggiornati: esito.aggiornati, invariati: esito.invariati, spariti: esito.spariti, eseguitoDa: user.name } });
  }, { timeout: 60_000 });
  await audit({ userId: user.id, action: "telepass.import", entity: "CartaCarburante", meta: { file: f.nomeFile, righe: righe.length, nuovi: esito.nuovi, aggiornati: esito.aggiornati, spariti: esito.spariti } });
  revalidatePath(BASE, "layout");
  const { dettaglio, ...conteggi } = esito;
  return { ...conteggi, esempi: dettaglio.filter((d) => d.esito !== "invariato").slice(0, 200) };
}

/** Modifica a mano di station e note di un dispositivo. */
export async function aggiornaDispositivo(codice: string, dati: { station: string; note: string }) {
  const user = await requireUser();
  assertCan(user, "telepass.anagrafiche");
  const d = z.object({ station: z.string().trim().min(1).max(80), note: z.string().max(500) }).parse(dati);
  const prima = await db.telepassDispositivo.findUniqueOrThrow({ where: { codice } });
  await db.telepassDispositivo.update({ where: { codice }, data: { station: d.station, note: d.note || null, aggiornatoDa: user.name } });
  await audit({ userId: user.id, action: "telepass.dispositivo.update", entity: "TelepassDispositivo", entityId: codice, meta: { before: { station: prima.station, note: prima.note }, after: d } });
  revalidatePath(BASE, "layout");
}

/** Modifica a mano di DS, appalto e note di una carta. */
export async function aggiornaCarta(pan: string, dati: { ds: string; appalto: string; note: string }) {
  const user = await requireUser();
  assertCan(user, "telepass.anagrafiche");
  const d = z.object({ ds: z.string().trim().max(40), appalto: z.string().trim().max(20), note: z.string().max(500) }).parse(dati);
  const prima = await db.cartaCarburante.findUniqueOrThrow({ where: { pan } });
  await db.cartaCarburante.update({ where: { pan }, data: { ds: d.ds || null, appalto: d.appalto || null, note: d.note || null, aggiornatoDa: user.name } });
  await audit({ userId: user.id, action: "telepass.carta.update", entity: "CartaCarburante", entityId: pan, meta: { before: { ds: prima.ds, appalto: prima.appalto, note: prima.note }, after: d } });
  revalidatePath(BASE, "layout");
}

const totali = z.record(z.string(), z.record(z.string(), z.number()));
const runBase = { ...file.shape, anno: z.number().int().min(2020).max(2100), mese: z.number().int().min(1).max(12), totale: z.number(), totali, anomalie: z.array(z.record(z.string(), z.unknown())).max(2000) };

export async function salvaTelepassRun(input: unknown): Promise<{ id: string }> {
  const user = await requireUser();
  assertCan(user, "telepass.run");
  const r = z.object({ ...runBase, righe: z.number().int(), fuoriMese: z.number().int(), nonMappati: z.number().int(), ricondotti: z.number().int() }).parse(input);
  const run = await db.telepassRun.create({
    data: { anno: r.anno, mese: r.mese, nomeFile: r.nomeFile, hashSha256: r.hash, righe: r.righe, fuoriMese: r.fuoriMese, nonMappati: r.nonMappati, ricondotti: r.ricondotti, totale: r.totale, totaliJson: r.totali, anomalieJson: r.anomalie as object[], eseguitoDa: user.name },
  });
  await audit({ userId: user.id, action: "telepass.run", entity: "TelepassRun", entityId: run.id, meta: { mese: `${r.anno}-${r.mese}`, righe: r.righe, totale: r.totale } });
  revalidatePath(BASE, "layout");
  return { id: run.id };
}

export async function salvaQ8Run(input: unknown): Promise<{ id: string }> {
  const user = await requireUser();
  assertCan(user, "telepass.run");
  const r = z.object({ ...runBase, righeExport: z.number().int(), tenute: z.number().int(), scartate: z.number().int(), nonCensite: z.number().int(), perIdentificativo: z.number().int() }).parse(input);
  const run = await db.q8Run.create({
    data: { anno: r.anno, mese: r.mese, nomeFile: r.nomeFile, hashSha256: r.hash, righeExport: r.righeExport, tenute: r.tenute, scartate: r.scartate, nonCensite: r.nonCensite, perIdentificativo: r.perIdentificativo, totale: r.totale, totaliJson: r.totali, anomalieJson: r.anomalie as object[], eseguitoDa: user.name },
  });
  await audit({ userId: user.id, action: "q8.run", entity: "Q8Run", entityId: run.id, meta: { mese: `${r.anno}-${r.mese}`, tenute: r.tenute, totale: r.totale } });
  revalidatePath(BASE, "layout");
  return { id: run.id };
}
