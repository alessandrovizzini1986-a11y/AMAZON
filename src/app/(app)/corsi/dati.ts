import "server-only";
import { db } from "@/lib/db";

/** Avanzamento di un utente: lezione ("corso/slug") → tentativi e data in cui è stata superata. */
export async function progresso(userId: string) {
  try {
    const r = await db.corsoProgresso.findMany({ where: { userId } });
    return new Map(r.map((x) => [x.lezione, { tentativi: x.tentativi, superataIl: x.superataIl?.toISOString() ?? null }]));
  } catch { return new Map<string, { tentativi: number; superataIl: string | null }>(); } // tabella non ancora creata su questo database
}

/** Avanzamento di tutti (per chi fa da tutor). */
export async function progressoDiTutti() {
  try {
    const [righe, utenti] = await Promise.all([db.corsoProgresso.findMany(), db.user.findMany({ where: { active: true }, select: { id: true, firstName: true, lastName: true, role: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] })]);
    // i driver non usano il sito per lavorare: compaiono solo se hanno iniziato un corso
    const conRighe = new Set(righe.map((r) => r.userId));
    return utenti.filter((u) => u.role !== "DRIVER" || conRighe.has(u.id)).map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`, role: u.role as string, righe: righe.filter((r) => r.userId === u.id).map((r) => ({ lezione: r.lezione, tentativi: r.tentativi, superataIl: r.superataIl?.toISOString() ?? null, ultimoIl: r.ultimoIl.toISOString() })) }));
  } catch { return []; }
}
