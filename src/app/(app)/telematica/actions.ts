"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { provaFonte } from "@/lib/telematica/prova";
import { riscaricaRifornimenti, scaricaGiorno } from "@/lib/telematica/scarico";

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

/** Segna un posto come parcheggio della station o come officina (o toglie il segno): da lì in poi non è più un'anomalia. Solo ADMIN. */
export async function segnaLuogoTelematica(input: { station: string; luogo: string; tipo: "PARCHEGGIO" | "OFFICINA" | "CASA" | "NESSUNO"; nota?: string }) {
  const user = await requireRole("ADMIN");
  const x = z.object({ station: z.string().min(2).max(10), luogo: z.string().trim().min(3).max(160), tipo: z.enum(["PARCHEGGIO", "OFFICINA", "CASA", "NESSUNO"]), nota: z.string().trim().max(120).optional() }).parse(input);
  const chiave = { station_luogo: { station: x.station, luogo: x.luogo } };
  if (x.tipo === "NESSUNO") await db.telematicaLuogo.deleteMany({ where: { station: x.station, luogo: x.luogo } });
  else await db.telematicaLuogo.upsert({ where: chiave, create: { station: x.station, luogo: x.luogo, tipo: x.tipo, nota: x.nota || null, creatoDa: user.name }, update: { tipo: x.tipo, nota: x.nota || null, creatoDa: user.name } });
  await audit({ userId: user.id, action: "telematica.luogo", entity: "TelematicaLuogo", meta: { station: x.station, luogo: x.luogo, tipo: x.tipo } });
  revalidatePath("/telematica/giornata");
}

/** Dettaglio dei rifornimenti (ora, litri, posto) per i giorni del mese scaricati prima che il sito lo salvasse. Solo ADMIN. */
export async function aggiornaRifornimentiTelematica(mese: string) {
  await requireRole("ADMIN");
  return riscaricaRifornimenti(z.string().regex(/^\d{4}-\d\d$/).parse(mese));
}
