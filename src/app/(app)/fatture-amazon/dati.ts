import "server-only";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { can, type Action } from "@/lib/rbac";
import { ultimoNumero } from "@/domain/fatture/importa";

/** Ultima fattura registrata e prossimo numero da scaricare. */
export async function statoNumeri() {
  try {
    const r = await db.amazonInvoice.findMany({ where: { numero: { startsWith: "INV-" } }, select: { numero: true } });
    return ultimoNumero(r.map((x) => x.numero));
  } catch {
    return { ultimo: null, prossimo: null };
  }
}

/** Descrizioni già viste nello storico (per marcare quelle "nuove" nell'anteprima). */
export async function descrizioniNote(): Promise<string[]> {
  try {
    const r = await db.amazonInvoiceLine.findMany({ distinct: ["descrizione"], select: { descrizione: true } });
    return r.map((x) => x.descrizione);
  } catch {
    return [];
  }
}

export async function mappaMacroarea(): Promise<Record<string, { macroarea: string; microarea: string }>> {
  try {
    const r = await db.macroareaMap.findMany();
    return Object.fromEntries(r.map((x) => [x.descrizione, { macroarea: x.macroarea, microarea: x.microarea }]));
  } catch {
    return {};
  }
}

/** Codice della station dell'utente (per RESP_MEZZI: fatturato solo della propria station). */
export async function stationUtente(user: SessionUser): Promise<string | null> {
  if (user.role === "ADMIN" || !user.stationId) return null;
  const s = await db.station.findUnique({ where: { id: user.stationId }, select: { code: true } });
  return s?.code ?? "—";
}

/** Utente con il permesso richiesto; altrimenti torna all'indice del modulo (che a sua volta smista). */
export async function utenteCon(perm: Action): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, perm)) redirect("/fatture-amazon");
  return user;
}
