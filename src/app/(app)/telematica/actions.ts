"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { provaFonte } from "@/lib/telematica/prova";
import { scaricaGiorno } from "@/lib/telematica/scarico";

/** Entra nel portale con l'utente salvato e fa le letture di base. Solo ADMIN. */
export async function provaCollegamento(fonte: string) {
  const user = await requireRole("ADMIN");
  const f = z.enum(["TARGA", "FLOTTAWEB"]).parse(fonte);
  const esiti = await provaFonte(f);
  await audit({ userId: user.id, action: "telematica.prova", entity: "TelematicaProva", meta: { fonte: f, riuscite: esiti.filter((e) => e.ok).length, totali: esiti.length } });
  revalidatePath("/telematica");
  return esiti;
}


/** Scarica dai portali un giorno per tutti i mezzi. Solo ADMIN. La pagina lo chiama un giorno alla volta. */
export async function scaricaGiornoTelematica(giorno: string) {
  const user = await requireRole("ADMIN");
  const g = z.string().regex(/^\d{4}-\d\d-\d\d$/).parse(giorno);
  const esito = await scaricaGiorno(g);
  await audit({ userId: user.id, action: "telematica.scarica", entity: "TelematicaGiorno", meta: { giorno: g, mezzi: esito.mezzi, errori: esito.errori } });
  return esito;
}
