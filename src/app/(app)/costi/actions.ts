"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { differenzeCDL, riepilogoCDL, type RigaCDL } from "@/domain/costi/anagrafica";

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const mese = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const n = z.number().finite().nullable();
const rigaCDL = z.object({
  cf: z.string().min(11).max(20), cognome: z.string().max(100), nome: z.string().max(100), station: z.string().max(20), contratto: z.string().max(100),
  pctPt: n, hSettim: n, ggLavorativi: n, tipologiaPt: z.string().max(100), rlm: n, edr: n, cdl: z.number().finite(), savingFeGg: n, savingRolH: n, savingExfH: n,
  costoFestNonGodutaGg: n, straoForfait: n,
});
const BASE = "/costi";
const d = (s: string) => new Date(s + "T00:00:00Z");
const daDb = (x: { cf: string; cognome: string; nome: string; station: string; cdl: unknown }) => ({ ...x, cdl: Number(x.cdl) }) as unknown as RigaCDL;

/** Anteprima: differenze con la versione precedente (l'ultima prima di `mese`, o la stessa se si ricarica). */
export async function anteprimaAnagrafica(input: { mese: string; righe: RigaCDL[] }) {
  const user = await requireUser();
  assertCan(user, "costi.parametri");
  const m = mese.parse(input.mese);
  const righe = z.array(rigaCDL).max(5000).parse(input.righe);
  const prec = await db.anagraficaCDL.findFirst({ where: { meseVersione: { lte: m } }, orderBy: { meseVersione: "desc" }, select: { meseVersione: true } });
  const prima = prec ? (await db.anagraficaCDL.findMany({ where: { meseVersione: prec.meseVersione }, select: { cf: true, cognome: true, nome: true, station: true, cdl: true } })).map(daDb) : [];
  const diff = differenzeCDL(prima, righe as RigaCDL[]);
  const lim = <T,>(a: T[]) => a.slice(0, 200);
  return {
    precedente: prec?.meseVersione ?? null, sovrascrive: prec?.meseVersione === m, riepilogoPrima: prima.length ? riepilogoCDL(prima) : null,
    entrati: lim(diff.entrati.map((r) => ({ cf: r.cf, nome: `${r.cognome} ${r.nome}`, station: r.station, cdl: r.cdl }))), nEntrati: diff.entrati.length,
    usciti: lim(diff.usciti.map((r) => ({ cf: r.cf, nome: `${r.cognome} ${r.nome}`, station: r.station, cdl: r.cdl }))), nUsciti: diff.usciti.length,
    cambiati: lim(diff.cambiati), nCambiati: diff.cambiati.length,
  };
}

/** Salva la versione (stesso mese = sostituita). Il file originale non viene salvato. */
export async function importaAnagrafica(input: { mese: string; nomeFile: string; righe: RigaCDL[] }) {
  const user = await requireUser();
  assertCan(user, "costi.parametri");
  const m = mese.parse(input.mese);
  const righe = z.array(rigaCDL).max(5000).parse(input.righe);
  const unici = new Map(righe.map((r) => [r.cf, r]));
  await db.$transaction(async (tx) => {
    await tx.anagraficaCDL.deleteMany({ where: { meseVersione: m } });
    await tx.anagraficaCDL.createMany({ data: [...unici.values()].map((r) => ({ ...r, meseVersione: m, caricatoDa: user.name })) });
  }, { timeout: 60_000 });
  const r = riepilogoCDL([...unici.values()] as RigaCDL[]);
  await audit({ userId: user.id, action: "costi.anagrafica", entity: "AnagraficaCDL", meta: { mese: m, file: z.string().max(300).parse(input.nomeFile), teste: r.teste, cdl: r.cdl, duplicati: righe.length - unici.size } });
  revalidatePath(BASE, "layout");
  return { teste: r.teste, cdl: r.cdl, duplicati: righe.length - unici.size };
}

export async function aggiungiTariffa(input: { voce: string; validaDal: string; valore: number; fonte?: string }) {
  const user = await requireUser();
  assertCan(user, "costi.parametri");
  const x = z.object({ voce: z.enum(["TRASFERTA", "TRASFERTA_DOM_EXTRA"]), validaDal: iso, valore: z.number().finite().min(0).max(1000), fonte: z.string().max(200).optional() }).parse(input);
  await db.tariffa.upsert({ where: { voce_validaDal: { voce: x.voce, validaDal: d(x.validaDal) } }, create: { ...x, validaDal: d(x.validaDal) }, update: { valore: x.valore, fonte: x.fonte } });
  await audit({ userId: user.id, action: "costi.tariffa", entity: "Tariffa", meta: x });
  revalidatePath(BASE, "layout");
}

export async function aggiungiParametro(input: { chiave: string; validaDal: string; valore: number; note?: string }) {
  const user = await requireUser();
  assertCan(user, "costi.parametri");
  const x = z.object({ chiave: z.string().regex(/^[A-Z0-9_]{2,40}$/), validaDal: iso, valore: z.number().finite(), note: z.string().max(300).optional() }).parse(input);
  await db.parametro.upsert({ where: { chiave_validaDal: { chiave: x.chiave, validaDal: d(x.validaDal) } }, create: { ...x, validaDal: d(x.validaDal), fonte: `manuale (${user.name})` }, update: { valore: x.valore, note: x.note, fonte: `manuale (${user.name})` } });
  await audit({ userId: user.id, action: "costi.parametro", entity: "Parametro", meta: x });
  revalidatePath(BASE, "layout");
}

export async function aggiungiFestivo(input: { data: string; descrizione: string; station: string }) {
  const user = await requireUser();
  assertCan(user, "costi.parametri");
  const x = z.object({ data: iso, descrizione: z.string().min(1).max(100), station: z.string().regex(/^(TUTTE|[A-Z]{3}\d)$/) }).parse(input);
  await db.festivo.upsert({ where: { data_station: { data: d(x.data), station: x.station } }, create: { ...x, data: d(x.data) }, update: { descrizione: x.descrizione } });
  await audit({ userId: user.id, action: "costi.festivo", entity: "Festivo", meta: x });
  revalidatePath(BASE, "layout");
}

export async function eliminaFestivo(id: string) {
  const user = await requireUser();
  assertCan(user, "costi.parametri");
  const f = await db.festivo.delete({ where: { id: z.string().min(1).max(40).parse(id) } });
  await audit({ userId: user.id, action: "costi.festivo.elimina", entity: "Festivo", entityId: f.id, meta: { data: f.data.toISOString().slice(0, 10), station: f.station } });
  revalidatePath(BASE, "layout");
}

const rigaAdit = z.object({
  meseCompetenza: z.string().regex(/^\d{4}-\d{2}$/), station: z.string().max(20), cf: z.string().max(20), cognome: z.string().max(100), nome: z.string().max(100),
  voceAdit: z.string().max(200), voce: z.string().max(30), quantita: z.number().finite(), costo: z.number().finite(), residuo: z.boolean(),
});

/** Import ADIT a lotti: il primo lotto cancella le righe già presenti per quel mese di fattura. */
export async function importaAdit(input: { meseFattura: string; righe: z.infer<typeof rigaAdit>[]; primo: boolean }) {
  const user = await requireUser();
  assertCan(user, "costi.run");
  const m = mese.parse(input.meseFattura);
  const righe = z.array(rigaAdit).max(3000).parse(input.righe);
  if (input.primo) await db.aditRiga.deleteMany({ where: { meseFattura: m } });
  const r = await db.aditRiga.createMany({ data: righe.map((x) => ({ ...x, meseFattura: m })) });
  return r.count;
}

export async function concludiImportAdit(c: { meseFattura: string; file: string; righe: number; costo: number }) {
  const user = await requireUser();
  assertCan(user, "costi.run");
  await audit({ userId: user.id, action: "costi.adit", entity: "AditRiga", meta: c });
  revalidatePath(BASE, "layout");
}

const rigaStima = z.object({ station: z.string().max(20), voce: z.string().max(40), quantita: z.number().finite().nullable(), tariffa: z.number().finite().nullable(), importo: z.number().finite() });

/** Salva la stima del mese (una nuova versione; l'indice usa la più recente). */
export async function salvaStima(input: { mese: string; popolazione: "STD" | "SIC"; righe: z.infer<typeof rigaStima>[]; versioneAnagrafica: string | null; versioneParametri: string | null; nota?: string }) {
  const user = await requireUser();
  assertCan(user, "costi.run");
  const m = mese.parse(input.mese);
  const pop = z.enum(["STD", "SIC"]).parse(input.popolazione);
  const righe = z.array(rigaStima).max(2000).parse(input.righe);
  const creataIl = new Date();
  await db.stimaCosti.createMany({ data: righe.map((r) => ({ ...r, mese: m, popolazione: pop, versioneAnagrafica: input.versioneAnagrafica, versioneParametri: input.versioneParametri, creataIl, creataDa: user.name })) });
  const totale = Math.round(righe.filter((r) => r.voce === "TOTALE").reduce((a, r) => a + r.importo, 0) * 100) / 100;
  await audit({ userId: user.id, action: "costi.stima", entity: "StimaCosti", meta: { mese: m, popolazione: pop, righe: righe.length, totale } });
  revalidatePath(BASE, "layout");
  return { creataIl: creataIl.toISOString(), totale };
}
