"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { getPiano, indiceVademecum } from "@/lib/training/piano";
import { TIPI, idSera } from "@/domain/training/piano";

/** Attività esistente (piano, extra o lettura serale) e il suo tipo. */
async function tipoAttivita(activityId: string): Promise<string | null> {
  const p = getPiano();
  for (const g of p.giorni) {
    if (activityId === idSera(g.day)) return "sera";
    const a = g.attivita.find((x) => x.id === activityId);
    if (a) return a.tipo;
  }
  if (activityId.startsWith("x-")) return (await db.trainingExtra.findUnique({ where: { id: activityId.slice(2) }, select: { tipo: true } }))?.tipo ?? null;
  return null;
}

/** "Fatto" / "Letto": solo sul proprio percorso. */
export async function segnaFatto(input: { activityId: string; done: boolean }) {
  const user = await requireUser();
  assertCan(user, "training.view");
  const x = z.object({ activityId: z.string().min(1).max(60), done: z.boolean() }).parse(input);
  if (!(await tipoAttivita(x.activityId))) throw new Error("attività inesistente");
  await db.trainingProgress.upsert({
    where: { userId_activityId: { userId: user.id, activityId: x.activityId } },
    create: { userId: user.id, activityId: x.activityId, done: x.done, doneAt: x.done ? new Date() : null },
    update: { done: x.done, doneAt: x.done ? new Date() : null },
  });
  revalidatePath("/training", "layout");
  return { ok: true };
}

/** "Validato" su un check della stagista: solo ADMIN. */
export async function valida(input: { userId: string; activityId: string; valido: boolean }) {
  const user = await requireUser();
  assertCan(user, "training.admin");
  const x = z.object({ userId: z.string().min(1).max(40), activityId: z.string().min(1).max(60), valido: z.boolean() }).parse(input);
  if ((await tipoAttivita(x.activityId)) !== "check") throw new Error("si validano solo le attività di tipo check");
  const dati = x.valido ? { validatedBy: user.id, validatedAt: new Date() } : { validatedBy: null, validatedAt: null };
  await db.trainingProgress.upsert({
    where: { userId_activityId: { userId: x.userId, activityId: x.activityId } },
    create: { userId: x.userId, activityId: x.activityId, done: false, ...dati },
    update: dati,
  });
  await audit({ userId: user.id, action: x.valido ? "training.valida" : "training.annullaValidazione", entity: "TrainingProgress", entityId: x.activityId, meta: { stagista: x.userId } });
  revalidatePath("/training", "layout");
  return { ok: true };
}

/** Note libere di giornata (autosave). */
export async function salvaNota(input: { day: number; text: string }) {
  const user = await requireUser();
  assertCan(user, "training.view");
  const x = z.object({ day: z.number().int().min(1).max(100), text: z.string().max(10000) }).parse(input);
  if (!getPiano().giorni.some((g) => g.day === x.day)) throw new Error("giorno inesistente");
  const r = await db.trainingNote.upsert({ where: { userId_day: { userId: user.id, day: x.day } }, create: { userId: user.id, day: x.day, text: x.text }, update: { text: x.text } });
  return { updatedAt: r.updatedAt.toISOString() };
}

const extra = z.object({
  day: z.number().int().min(1).max(100), tipo: z.enum(TIPI), chi: z.string().trim().min(1).max(80), durata: z.number().int().min(5).max(600),
  testo: z.string().trim().min(3).max(2000), sezioni: z.array(z.string().trim().min(1).max(160)).max(8),
});

/** Attività aggiunta al volo dall'admin (in coda a quelle del piano). */
export async function aggiungiExtra(input: z.infer<typeof extra>) {
  const user = await requireUser();
  assertCan(user, "training.admin");
  const x = extra.parse(input);
  if (!getPiano().giorni.some((g) => g.day === x.day)) return { errore: "Giorno inesistente." };
  const { indice } = indiceVademecum();
  const sbagliate = x.sezioni.filter((s) => { const [slug, anc] = s.split("#"); return !indice.has(slug) || (anc && !indice.get(slug)!.has(anc)); });
  if (sbagliate.length) return { errore: `Sezioni del vademecum inesistenti: ${sbagliate.join(", ")}` };
  const r = await db.trainingExtra.create({ data: { ...x, createdBy: user.id } });
  await audit({ userId: user.id, action: "training.extra.crea", entity: "TrainingExtra", entityId: r.id, meta: { day: x.day, tipo: x.tipo } });
  revalidatePath("/training", "layout");
  return { ok: true };
}

export async function eliminaExtra(input: { id: string }) {
  const user = await requireUser();
  assertCan(user, "training.admin");
  const id = z.string().min(1).max(40).parse(input.id);
  await db.trainingExtra.delete({ where: { id } });
  await db.trainingProgress.deleteMany({ where: { activityId: `x-${id}` } });
  await audit({ userId: user.id, action: "training.extra.elimina", entity: "TrainingExtra", entityId: id });
  revalidatePath("/training", "layout");
  return { ok: true };
}
