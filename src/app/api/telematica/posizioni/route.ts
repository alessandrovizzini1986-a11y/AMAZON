import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { posizioniLive } from "@/lib/telematica/posizioni";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Posizioni in tempo reale dei mezzi (Targa + FlottaWeb). Solo ADMIN. */
export async function GET() {
  await requireRole("ADMIN");
  return NextResponse.json(await posizioniLive(), { headers: { "Cache-Control": "no-store" } });
}
