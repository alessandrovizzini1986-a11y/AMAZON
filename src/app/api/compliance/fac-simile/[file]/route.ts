import { NextResponse } from "next/server";
import JSZip from "jszip";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { FAC_SIMILE } from "@/domain/compliance/seed";

export const dynamic = "force-dynamic";
const NOTI = new Set(Object.values(FAC_SIMILE).flat().map((f) => f.file));
const TIPO: Record<string, string> = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", zip: "application/zip" };

/** Fac-simile del Compliance Tool: stanno nel database e si danno solo a chi è entrato e vede il registro. Solo i file dell'elenco. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const user = await requireUser();
  if (!can(user, "compliance.view")) return new NextResponse("Non consentito", { status: 403 });
  const nome = decodeURIComponent((await params).file);
  if (nome === "tutti.zip") {
    const zip = new JSZip();
    for (const f of await db.complianceFacSimile.findMany()) if (NOTI.has(f.file)) zip.file(f.file, f.dati);
    return new NextResponse(new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })), { headers: { "Content-Type": TIPO.zip, "Content-Disposition": 'attachment; filename="ComplianceTool_FacSimile.zip"', "Cache-Control": "private, no-store" } });
  }
  if (!NOTI.has(nome)) return new NextResponse("Non trovato", { status: 404 });
  const f = await db.complianceFacSimile.findUnique({ where: { file: nome } });
  if (!f) return new NextResponse("Fac-simile non ancora caricato", { status: 404 });
  return new NextResponse(new Uint8Array(f.dati), { headers: { "Content-Type": TIPO[nome.split(".").pop() ?? ""] ?? "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`, "Cache-Control": "private, no-store" } });
}
