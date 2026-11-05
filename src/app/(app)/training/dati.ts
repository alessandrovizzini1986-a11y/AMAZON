import "server-only";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import type { SessionUser } from "@/lib/auth";
import type { Attivita, StatoAttivita, Tipo } from "@/domain/training/piano";

export type Soggetto = { id: string; nome: string; seStesso: boolean };

/** Di chi si mostra il percorso: la stagista per sé; l'admin vede la stagista scelta (?u=) o la prima attiva, altrimenti sé stesso (anteprima). */
export async function soggetto(user: SessionUser, u?: string): Promise<{ sogg: Soggetto; stagiste: Soggetto[] }> {
  if (!can(user, "training.admin")) return { sogg: { id: user.id, nome: user.name, seStesso: true }, stagiste: [] };
  const st = await db.user.findMany({ where: { role: "STAGISTA" }, orderBy: [{ active: "desc" }, { lastName: "asc" }], select: { id: true, firstName: true, lastName: true } }).catch(() => []);
  const stagiste = st.map((x) => ({ id: x.id, nome: `${x.firstName} ${x.lastName}`, seStesso: false }));
  const s = stagiste.find((x) => x.id === u) ?? stagiste[0];
  return { sogg: s ?? { id: user.id, nome: user.name, seStesso: true }, stagiste };
}

export async function statoUtente(userId: string): Promise<Map<string, StatoAttivita & { doneAt: string | null; validatedAt: string | null }>> {
  const r = await db.trainingProgress.findMany({ where: { userId } }).catch(() => []);
  return new Map(r.map((x) => [x.activityId, { done: x.done, validated: !!x.validatedAt, doneAt: x.doneAt?.toISOString() ?? null, validatedAt: x.validatedAt?.toISOString() ?? null }]));
}

export async function extraPerGiorno(): Promise<Map<number, Attivita[]>> {
  const r = await db.trainingExtra.findMany({ orderBy: { createdAt: "asc" } }).catch(() => []);
  const m = new Map<number, Attivita[]>();
  for (const x of r) m.set(x.day, [...(m.get(x.day) ?? []), { id: `x-${x.id}`, tipo: x.tipo as Tipo, chi: x.chi, durata: x.durata, testo: x.testo, ancore: x.sezioni, extra: true }]);
  return m;
}

export async function noteUtente(userId: string): Promise<Map<number, { text: string; updatedAt: string }>> {
  const r = await db.trainingNote.findMany({ where: { userId } }).catch(() => []);
  return new Map(r.map((x) => [x.day, { text: x.text, updatedAt: x.updatedAt.toISOString() }]));
}

/** Data di oggi a Roma (AAAA-MM-GG). */
export const oggiRoma = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
