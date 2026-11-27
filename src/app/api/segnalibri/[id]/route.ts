import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** La pagina originale di un segnalibro: solo da scaricare (mai mostrata dentro il sito), solo a chi è entrato. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(user, "home.view")) return new NextResponse("Non consentito", { status: 403 });
  const s = await db.segnalibro.findUnique({ where: { id: (await params).id }, select: { pagina: true, nomeFile: true, titolo: true } });
  if (!s?.pagina) return new NextResponse("Non trovato", { status: 404 });
  const nome = s.nomeFile || `${s.titolo}.html`;
  return new NextResponse(new Uint8Array(s.pagina), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
}
