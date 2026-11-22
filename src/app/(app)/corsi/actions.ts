"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan, can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { corso } from "@/content/corsi";
import { chiaveLezione, correggi, statoLezioni, type Esito, type Risposta } from "@/domain/corsi/corsi";

const input = z.object({
  corso: z.string().min(1).max(40), slug: z.string().min(1).max(60),
  risposte: z.record(z.string().max(20), z.union([z.number(), z.array(z.number().nullable()).max(10), z.string().max(40), z.null()])),
  /** solo per gli esercizi di ripasso (lezione già superata o tutor): quale variante è a video */
  variante: z.number().int().min(0).max(1000).optional(),
});

/**
 * Consegna gli esercizi di una lezione. La correzione è qui, sul server: le soluzioni non arrivano al browser.
 * Lezione ancora da superare: conta il tentativo e, se tutto è giusto, la segna superata (e apre la successiva).
 * Lezione già superata o aperta in ripasso da un tutor: corregge e basta.
 */
export async function consegna(x: z.infer<typeof input>): Promise<{ esiti: Esito[]; superata: boolean; registrata: boolean }> {
  const user = await requireUser();
  assertCan(user, "vademecum.view");
  const i = input.parse(x);
  const c = corso(i.corso), l = c?.lezioni.find((z1) => z1.slug === i.slug);
  if (!c || !l) throw new Error("Lezione inesistente");
  const righe = await db.corsoProgresso.findMany({ where: { userId: user.id, lezione: { startsWith: `${c.id}/` } } });
  const superate = new Set(righe.filter((r) => r.superataIl).map((r) => r.lezione.slice(c.id.length + 1)));
  const stato = statoLezioni(c, superate)[c.lezioni.indexOf(l)];
  const chiave = chiaveLezione(c.id, l.slug);
  if (stato !== "aperta") {
    if (stato === "chiusa" && !can(user, "training.admin")) throw new Error("Questa lezione si apre dopo aver superato quella prima.");
    return { ...correggi(l, i.variante ?? 0, i.risposte as Record<string, Risposta>), registrata: false };
  }
  const tentativi = righe.find((r) => r.lezione === chiave)?.tentativi ?? 0;
  const esito = correggi(l, tentativi, i.risposte as Record<string, Risposta>);
  await db.corsoProgresso.upsert({
    where: { userId_lezione: { userId: user.id, lezione: chiave } },
    create: { userId: user.id, lezione: chiave, tentativi: 1, superataIl: esito.superata ? new Date() : null },
    update: { tentativi: { increment: 1 }, ultimoIl: new Date(), ...(esito.superata ? { superataIl: new Date() } : {}) },
  });
  if (esito.superata) await audit({ userId: user.id, action: "corsi.lezione", entity: "CorsoProgresso", entityId: chiave, meta: { tentativi: tentativi + 1 } });
  // niente revalidatePath: ricaricherebbe la lezione (nuova variante degli esercizi) prima che si leggano le spiegazioni.
  // Le pagine dei corsi sono dinamiche: si aggiornano alla prossima apertura o quando si preme Riprova.
  return { ...esito, registrata: true };
}
