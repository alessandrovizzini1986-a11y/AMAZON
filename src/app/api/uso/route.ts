import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { voceDi } from "@/components/navModel";
import { giornoRoma } from "@/domain/telematica";

export const dynamic = "force-dynamic";

const corpo = z.object({ p: z.string().startsWith("/").max(200), v: z.number().int().min(0).max(1), s: z.number().int().min(0).max(1800) });

/** Statistica d'uso: aumenta i contatori del giorno per chi è collegato e per la voce di menu della pagina. */
export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) return new NextResponse(null, { status: 204 });
  const x = corpo.safeParse(await req.json().catch(() => null));
  if (!x.success) return new NextResponse(null, { status: 204 });
  const chiave = { giorno: giornoRoma(new Date()), userId: user.id, voce: voceDi(x.data.p) };
  try { await db.usoPagina.upsert({ where: { giorno_userId_voce: chiave }, create: { ...chiave, visite: x.data.v, secondi: x.data.s }, update: { visite: { increment: x.data.v }, secondi: { increment: x.data.s } } }); } catch { /* una statistica persa non è un errore */ }
  return new NextResponse(null, { status: 204 });
}
