import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { datiRiconciliazione } from "@/lib/carburante/riconciliazione";
import { filtraRighe, isMeseValido, leggiFiltro } from "@/lib/carburante/filtro";
import { csvRighe, nomeFileExport } from "@/lib/carburante/esporta";
import { excelRiconciliazione } from "@/lib/carburante/excel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Export della pagina "Carburante: Q8 e telematica" con gli stessi filtri: mese, flotta, targa, regolari, nonverificabili,
 * archiviate; formato=xlsx (predefinito) o csv. Solo ADMIN.
 */
export async function GET(req: NextRequest) {
  const user = await requireRole("ADMIN");
  // la voce di menu tolta dal super admin vale anche per il suo export (l'indirizzo /api/carburante/… non le appartiene)
  if (user.nascosti?.includes("/telematica/carburante")) return NextResponse.json({ errore: "pagina non disponibile" }, { status: 403 });
  const p = req.nextUrl.searchParams;
  const mese = p.get("mese");
  if (!isMeseValido(mese)) return NextResponse.json({ errore: "mese non valido: usa AAAA-MM" }, { status: 400 });
  const formato = p.get("formato") === "csv" ? "csv" : "xlsx";
  const f = leggiFiltro(p, mese);
  const dati = await datiRiconciliazione(mese);
  const righe = filtraRighe(dati.righe, f);
  const intestazioni = { "Content-Disposition": `attachment; filename="${nomeFileExport(mese, formato)}"`, "Cache-Control": "no-store" };
  if (formato === "csv") return new NextResponse(csvRighe(righe), { headers: { ...intestazioni, "Content-Type": "text/csv; charset=utf-8" } });
  const buf = await excelRiconciliazione(righe, dati, f);
  return new NextResponse(buf, { headers: { ...intestazioni, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
}
