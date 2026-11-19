"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { cifra, decifra } from "@/lib/credenziali";
import { PORTALE_GLS, URL_GLS, notaSede } from "./accesso";

/** Password del portale GLS: solo chi ha il permesso, ogni lettura nel registro attività. */
export async function passwordGls(): Promise<{ password?: string; errore?: string }> {
  const user = await requireUser();
  assertCan(user, "spedizioni.view");
  const p = await db.portaleCredenziale.findUnique({ where: { portale: PORTALE_GLS } });
  if (!p?.passwordCifrata) return { errore: "Nessuna password salvata: scrivila in Modifica accesso." };
  await audit({ userId: user.id, action: "spedizioni.password", entity: "PortaleCredenziale", entityId: p.id, meta: { portale: PORTALE_GLS } });
  try { return { password: decifra(p.passwordCifrata) }; } catch { return { errore: "La password non si legge: la chiave del server è cambiata. Riscrivila in Modifica accesso." }; }
}

/** Salva nome utente, sede e (se scritta) password del portale GLS. La password viene cifrata; vuota = resta quella di prima. */
export async function salvaAccessoGls(input: { username: string; sede: string; password: string }) {
  const user = await requireUser();
  assertCan(user, "spedizioni.view");
  const v = z.object({ username: z.string().trim().min(1).max(100), sede: z.string().trim().min(1).max(100), password: z.string().max(200) }).parse(input);
  const dati = { url: URL_GLS, username: v.username, note: notaSede(v.sede), aggiornatoDa: user.name, ...(v.password ? { passwordCifrata: cifra(v.password) } : {}) };
  await db.portaleCredenziale.upsert({ where: { portale: PORTALE_GLS }, create: { portale: PORTALE_GLS, ...dati }, update: dati });
  await audit({ userId: user.id, action: "spedizioni.accesso", entity: "PortaleCredenziale", meta: { portale: PORTALE_GLS, passwordCambiata: !!v.password } });
  revalidatePath("/spedizioni-gls"); revalidatePath("/portali");
  return { ok: true };
}
