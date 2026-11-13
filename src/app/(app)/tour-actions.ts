"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { chiaveTour, haTour } from "@/content/tour";

/** Segna il tour di benvenuto come fatto (o come "non mostrarlo più") per l'utente e il suo ruolo. */
export async function segnaTour(esito: "completato" | "saltato") {
  const user = await requireUser();
  if (!haTour(user.role)) return;
  const e = esito === "completato" ? "completato" : "saltato";
  const chiave = chiaveTour(user.role);
  await db.tourVisto.upsert({ where: { userId_chiave: { userId: user.id, chiave } }, create: { userId: user.id, chiave, esito: e }, update: { esito: e, il: new Date() } });
}
