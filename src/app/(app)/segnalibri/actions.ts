"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { leggiPagina } from "@/domain/segnalibri/leggi";

const MAX = 2 * 1024 * 1024;

/** Carica una pagina HTML con dei segnalibri. Con `id` sostituisce pulsanti, istruzioni e pagina di quella scheda. */
export async function caricaPagina(form: FormData): Promise<{ errore: string } | { ok: true; pulsanti: number }> {
  const user = await requireUser();
  assertCan(user, "config.manage");
  const file = form.get("file"), id = z.string().optional().parse(form.get("id") || undefined);
  if (!(file instanceof File) || !file.size) return { errore: "Scegli un file" };
  if (!/\.html?$/i.test(file.name)) return { errore: "Serve un file .html" };
  if (file.size > MAX) return { errore: "Il file supera 2 MB" };
  const dati = Buffer.from(await file.arrayBuffer());
  const letto = leggiPagina(dati.toString("utf8"));
  if (!letto.pulsanti.length) return { errore: "In questa pagina non ho trovato segnalibri (link che cominciano con javascript:)" };
  const comune = { pulsanti: letto.pulsanti, istruzioni: letto.istruzioni, nomeFile: file.name.slice(0, 200), pagina: dati, aggiornatoIl: new Date(), aggiornatoDa: user.name };
  if (id) await db.segnalibro.update({ where: { id }, data: comune });
  else {
    const ultimo = await db.segnalibro.aggregate({ _max: { ordine: true } });
    await db.segnalibro.create({ data: { ...comune, titolo: (letto.titolo || file.name.replace(/\.html?$/i, "")).slice(0, 120), ordine: (ultimo._max.ordine ?? 0) + 1 } });
  }
  await audit({ userId: user.id, action: id ? "segnalibri.sostituisci" : "segnalibri.carica", entity: "Segnalibro", entityId: id, meta: { file: file.name, pulsanti: letto.pulsanti.length } });
  revalidatePath("/segnalibri");
  return { ok: true, pulsanti: letto.pulsanti.length };
}

const testi = z.object({ id: z.string(), titolo: z.string().trim().min(1).max(120), descrizione: z.string().trim().max(300), istruzioni: z.string().max(20000) });

export async function salvaTesti(input: z.infer<typeof testi>) {
  const user = await requireUser();
  assertCan(user, "config.manage");
  const { id, ...d } = testi.parse(input);
  await db.segnalibro.update({ where: { id }, data: { ...d, aggiornatoIl: new Date(), aggiornatoDa: user.name } });
  await audit({ userId: user.id, action: "segnalibri.testi", entity: "Segnalibro", entityId: id });
  revalidatePath("/segnalibri");
}

export async function elimina(id: string) {
  const user = await requireUser();
  assertCan(user, "config.manage");
  const s = await db.segnalibro.delete({ where: { id: z.string().parse(id) }, select: { titolo: true } });
  await audit({ userId: user.id, action: "segnalibri.elimina", entity: "Segnalibro", entityId: id, meta: { titolo: s.titolo } });
  revalidatePath("/segnalibri");
}
