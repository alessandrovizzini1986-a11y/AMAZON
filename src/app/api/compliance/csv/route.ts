import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { righe } from "@/lib/compliance/dati";
import { it } from "@/domain/compliance/scadenze";
import { NOME_STATO } from "@/domain/compliance/stato";

export const dynamic = "force-dynamic";

/** Export CSV della griglia del mese (separatore ; per Excel italiano). */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!can(user, "compliance.view")) return new NextResponse("Non consentito", { status: 403 });
  const mese = req.nextUrl.searchParams.get("mese") ?? "", entita = req.nextUrl.searchParams.get("entita") ?? undefined;
  if (!/^\d{4}-\d{2}$/.test(mese)) return new NextResponse("Mese non valido", { status: 400 });
  const r = await righe({ anno: Number(mese.slice(0, 4)), mese: Number(mese.slice(5)), entita: entita === "PS" || entita === "ADECCO" ? entita : undefined });
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const testa = ["Entità", "Area", "Mese", "Folder", "Documento", "Formato", "Chi", "Stato", "Scadenza interna", "Scadenza portale", "Caricato da", "Caricato il", "File caricato", "Motivo rifiuto", "Note"];
  const corpo = r.map((x) => [x.entita, x.area, `${String(x.mese).padStart(2, "0")}/${x.anno}`, x.folder, x.documento, x.formato, x.owner, NOME_STATO[x.stato], it(x.scadenzaInterna), it(x.scadenzaPortale), x.caricatoDa, x.caricatoIl ? new Date(x.caricatoIl).toLocaleString("it-IT", { timeZone: "Europe/Rome" }) : "", x.nomeFileCaricato, x.motivoRifiuto, x.note].map(q).join(";"));
  return new NextResponse("﻿" + [testa.map(q).join(";"), ...corpo].join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="compliance_${mese}${entita ? `_${entita}` : ""}.csv"`, "Cache-Control": "private, no-store" } });
}
