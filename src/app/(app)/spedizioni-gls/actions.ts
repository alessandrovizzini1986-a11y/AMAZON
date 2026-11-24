"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { cifra, decifra } from "@/lib/credenziali";
import { createHash } from "node:crypto";
import { PORTALE_GLS, URL_GLS, notaSede } from "./accesso";
import { SERVIZI, testoStabile, type AzioneGls, type Bollettino, type RigaStoricoGls } from "@/domain/gls/bollettino";

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

const t = (max: number) => z.string().max(max);
const parte = z.object({ nome: t(120), via: t(120), citta: t(80), cap: t(10), telefono: t(40), email: t(100) });
const bollettino = z.object({
  numero: t(40), mittente: parte, rifMittente: t(80), destinatario: parte, fermoDeposito: z.boolean(),
  colli: t(10), pesoKg: t(20), dimensioni: z.tuple([t(10), t(10), t(10)]), contenuto: t(200), contrassegno: t(20), modalitaIncasso: t(60),
  servizi: z.array(z.enum(Object.keys(SERVIZI) as [keyof typeof SERVIZI, ...(keyof typeof SERVIZI)[]])).max(6),
  porto: z.enum(["", "franco", "assegnato", "afm"]), afmCodice: t(40), assicurazione: z.enum(["", "no", "si", "1010"]), valore: t(20),
  accessori: z.array(t(80)).max(8), note: t(400), data: t(10), ora: t(10),
});

/**
 * Storico: registra il bollettino appena scaricato, stampato o inviato, con tutti i campi del modulo.
 * Lo stesso bollettino (stessi dati) resta una riga sola: si aggiunge solo l'azione fatta.
 */
export async function registraBollettino(input: { dati: Bollettino; azione: AzioneGls }): Promise<{ id: string }> {
  const user = await requireUser();
  assertCan(user, "spedizioni.view");
  const dati = bollettino.parse(input.dati) as Bollettino;
  const azione = z.enum(["scarica", "stampa", "invia"]).parse(input.azione);
  const impronta = createHash("sha256").update(testoStabile(dati)).digest("hex");
  const c = await db.glsBollettino.findUnique({ where: { impronta } });
  if (c) {
    const azioni = [...new Set([...c.azioni.split(",").filter(Boolean), azione])].join(",");
    await db.glsBollettino.update({ where: { id: c.id }, data: { azioni, ultimaAzioneIl: new Date() } });
    return { id: c.id };
  }
  const n = await db.glsBollettino.create({
    data: {
      impronta, dataSpedizione: dati.data, numero: dati.numero.trim(), mittente: dati.mittente.nome.trim(), destinatario: dati.destinatario.nome.trim(), citta: dati.destinatario.citta.trim(), cap: dati.destinatario.cap.trim(),
      colli: dati.colli.trim(), pesoKg: dati.pesoKg.trim(), contrassegno: dati.contrassegno.trim(), dati, azioni: azione, creatoDa: user.name,
    },
  });
  await audit({ userId: user.id, action: "spedizioni.bollettino", entity: "GlsBollettino", entityId: n.id, meta: { destinatario: n.destinatario, citta: n.citta, colli: n.colli, azione } });
  return { id: n.id };
}

/** Gli ultimi bollettini dello storico, dal più recente (i dati completi servono a riaprirli e rifare il PDF). */
export async function storicoBollettini(limite = 300): Promise<RigaStoricoGls[]> {
  const user = await requireUser();
  assertCan(user, "spedizioni.view");
  const r = await db.glsBollettino.findMany({ orderBy: { creatoIl: "desc" }, take: Math.min(Math.max(limite, 1), 1000) });
  return r.map((x) => ({ id: x.id, quando: x.creatoIl.toISOString(), chi: x.creatoDa, azioni: x.azioni.split(",").filter(Boolean), dataSpedizione: x.dataSpedizione, numero: x.numero, mittente: x.mittente, destinatario: x.destinatario, citta: x.citta, cap: x.cap, colli: x.colli, pesoKg: x.pesoKg, contrassegno: x.contrassegno, dati: x.dati as unknown as Bollettino }));
}
