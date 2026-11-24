import { NextRequest, NextResponse } from "next/server";
import { scaricoNotturno } from "@/lib/telematica/scarico";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Chiamata automatica della notte (vercel.json). Non richiede login: per questo fa una cosa sola e innocua,
 * scaricare un giorno che manca tra gli ultimi tre; se non manca niente non fa nulla. Se è impostata CRON_SECRET la pretende.
 */
export async function GET(req: NextRequest) {
  const segreto = process.env.CRON_SECRET;
  if (segreto && req.headers.get("authorization") !== `Bearer ${segreto}`) return NextResponse.json({ errore: "non autorizzato" }, { status: 401 });
  try {
    const e = await scaricoNotturno();
    return NextResponse.json("fatto" in e ? { fatto: false } : { giorno: e.giorno, mezzi: e.mezzi, errori: e.errori });
  } catch { return NextResponse.json({ errore: "scarico non riuscito" }, { status: 500 }); }
}
