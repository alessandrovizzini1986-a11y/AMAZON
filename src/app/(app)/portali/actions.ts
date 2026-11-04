"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, verifyCredentials } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { cifra, decifra } from "@/lib/credenziali";

const riga = z.object({
  portale: z.string().trim().min(1).max(120), url: z.string().trim().max(500).nullable(), username: z.string().trim().max(200).nullable(),
  password: z.string().max(500).nullable(), note: z.string().trim().max(1000).nullable(),
});

/** Salva (crea o aggiorna) uno o più portali. Una password vuota non cancella quella salvata. */
export async function salvaPortali(input: { righe: z.infer<typeof riga>[]; fonte: string }) {
  const user = await requireRole("ADMIN");
  const righe = z.array(riga).min(1).max(100).parse(input.righe);
  for (const r of righe) {
    const dati = { url: r.url || null, username: r.username || null, note: r.note || null, aggiornatoDa: user.name, ...(r.password ? { passwordCifrata: cifra(r.password) } : {}) };
    await db.portaleCredenziale.upsert({ where: { portale: r.portale }, create: { portale: r.portale, ...dati }, update: dati });
  }
  // nel log solo i nomi dei portali, mai username o password
  await audit({ userId: user.id, action: "portali.salva", entity: "PortaleCredenziale", meta: { portali: righe.map((r) => r.portale), fonte: z.string().max(200).parse(input.fonte) } });
  revalidatePath("/portali");
  return { righe: righe.length };
}

/** Mostra una password: solo ADMIN e solo dopo aver riscritto la propria password. */
export async function mostraPassword(input: { id: string; passwordAdmin: string }) {
  const user = await requireRole("ADMIN");
  const x = z.object({ id: z.string().min(1).max(40), passwordAdmin: z.string().min(1).max(200) }).parse(input);
  const ok = await verifyCredentials(user.email, x.passwordAdmin);
  const p = await db.portaleCredenziale.findUnique({ where: { id: x.id } });
  if (!ok || ok.role !== "ADMIN" || ok.id !== user.id) {
    await audit({ userId: user.id, action: "portali.mostra.negato", entity: "PortaleCredenziale", entityId: x.id, meta: { portale: p?.portale ?? null } });
    await new Promise((r) => setTimeout(r, 1500)); // rallenta i tentativi
    return { errore: "Password admin sbagliata." };
  }
  if (!p?.passwordCifrata) return { errore: "Nessuna password salvata per questo portale." };
  await audit({ userId: user.id, action: "portali.mostra", entity: "PortaleCredenziale", entityId: p.id, meta: { portale: p.portale } });
  try { return { password: decifra(p.passwordCifrata) }; } catch { return { errore: "La password non si legge: la chiave del server è cambiata. Reinseriscila." }; }
}

export async function eliminaPortale(id: string) {
  const user = await requireRole("ADMIN");
  const p = await db.portaleCredenziale.delete({ where: { id: z.string().min(1).max(40).parse(id) } });
  await audit({ userId: user.id, action: "portali.elimina", entity: "PortaleCredenziale", entityId: id, meta: { portale: p.portale } });
  revalidatePath("/portali");
}
