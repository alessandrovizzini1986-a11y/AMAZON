"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { STATIONS } from "@/domain/presenze/regole";

const PATH = "/presenze/configurazione";
async function admin() {
  const user = await requireUser();
  assertCan(user, "presenze.config");
  return user;
}
const up = (v: FormDataEntryValue | null) => String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase();

export async function salvaReferenti(formData: FormData) {
  const user = await admin();
  const valori = STATIONS.map((s) => ({ station: s, nome: String(formData.get(s) ?? "").trim().slice(0, 80) }));
  for (const v of valori) {
    if (v.nome) await db.presenzeReferente.upsert({ where: { station: v.station }, create: v, update: { nome: v.nome } });
    else await db.presenzeReferente.deleteMany({ where: { station: v.station } });
  }
  await audit({ userId: user.id, action: "presenze.referenti", entity: "PresenzeReferente", meta: Object.fromEntries(valori.map((v) => [v.station, v.nome])) });
  revalidatePath(PATH);
}

const disp = z.object({ cognome: z.string().min(2).max(60), nome: z.string().min(2).max(60), station: z.enum(STATIONS).nullable() });

export async function aggiungiDispatcher(formData: FormData) {
  const user = await admin();
  const st = String(formData.get("station") ?? "");
  const d = disp.parse({ cognome: up(formData.get("cognome")), nome: up(formData.get("nome")), station: st || null });
  await db.presenzeDispatcher.upsert({ where: { cognome_nome: { cognome: d.cognome, nome: d.nome } }, create: d, update: { station: d.station, attivo: true } });
  await audit({ userId: user.id, action: "presenze.dispatcher.add", entity: "PresenzeDispatcher", meta: d });
  revalidatePath(PATH);
}

export async function attivaDispatcher(id: string) {
  const user = await admin();
  const d = await db.presenzeDispatcher.findUniqueOrThrow({ where: { id } });
  await db.presenzeDispatcher.update({ where: { id }, data: { attivo: !d.attivo } });
  await audit({ userId: user.id, action: d.attivo ? "presenze.dispatcher.off" : "presenze.dispatcher.on", entity: "PresenzeDispatcher", entityId: id, meta: { nome: `${d.cognome} ${d.nome}` } });
  revalidatePath(PATH);
}

export async function eliminaDispatcher(id: string) {
  const user = await admin();
  const d = await db.presenzeDispatcher.delete({ where: { id } });
  await audit({ userId: user.id, action: "presenze.dispatcher.delete", entity: "PresenzeDispatcher", entityId: id, meta: { nome: `${d.cognome} ${d.nome}` } });
  revalidatePath(PATH);
}

const giu = z.object({ codice: z.string().regex(/^[A-Z0-9]{1,20}$/, "codice: solo lettere e numeri, senza spazi"), descrizione: z.string().max(100) });

export async function aggiungiGiustificativo(formData: FormData) {
  const user = await admin();
  const g = giu.parse({ codice: up(formData.get("codice")), descrizione: String(formData.get("descrizione") ?? "").trim() });
  await db.presenzeGiustificativo.upsert({ where: { codice: g.codice }, create: g, update: { descrizione: g.descrizione, attivo: true } });
  await audit({ userId: user.id, action: "presenze.giustificativo.add", entity: "PresenzeGiustificativo", entityId: g.codice, meta: g });
  revalidatePath(PATH);
}

export async function attivaGiustificativo(codice: string) {
  const user = await admin();
  const g = await db.presenzeGiustificativo.findUniqueOrThrow({ where: { codice } });
  await db.presenzeGiustificativo.update({ where: { codice }, data: { attivo: !g.attivo } });
  await audit({ userId: user.id, action: g.attivo ? "presenze.giustificativo.off" : "presenze.giustificativo.on", entity: "PresenzeGiustificativo", entityId: codice });
  revalidatePath(PATH);
}

export async function eliminaGiustificativo(codice: string) {
  const user = await admin();
  await db.presenzeGiustificativo.delete({ where: { codice } });
  await audit({ userId: user.id, action: "presenze.giustificativo.delete", entity: "PresenzeGiustificativo", entityId: codice });
  revalidatePath(PATH);
}
