import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getSearchBlocks } from "@/lib/vademecum";

/** Blocchi di testo del Vademecum per la ricerca nel browser (dietro login). */
export async function GET() {
  const user = await requireUser();
  if (!can(user, "vademecum.view")) return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  return NextResponse.json(getSearchBlocks(), {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
