import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { excelCompleto, nomeFileCompleto } from "@/lib/fatture/excelCompleto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Excel con tutte le fatture dell'anno registrate sul sito (righe nelle 16 colonne di fatt_AAAA). */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!can(user, "fatture.registro")) return NextResponse.json({ error: "Permesso negato" }, { status: 403 });
  const anno = Number(req.nextUrl.searchParams.get("anno")) || new Date().getFullYear();
  if (anno < 2020 || anno > 2100) return NextResponse.json({ error: "Anno non valido" }, { status: 400 });
  // le fatture dell'anno: quelle con almeno una riga dell'anno, più quelle emesse nell'anno per servizi di anni precedenti
  const inizio = new Date(Date.UTC(anno, 0, 1)), fine = new Date(Date.UTC(anno + 1, 0, 1));
  const fatture = await db.amazonInvoice.findMany({
    where: { OR: [{ righe: { some: { anno } } }, { dataFattura: { gte: inizio, lt: fine }, fonte: "PDF" }] },
    select: { id: true, numero: true, ds: true, tipo: true, dataFattura: true, fonte: true, sommaAvere: true },
  });
  const ids = new Map(fatture.map((f) => [f.id, f.numero]));
  const linee = await db.amazonInvoiceLine.findMany({
    where: { OR: [{ anno }, { anno: { lt: anno }, invoice: { dataFattura: { gte: inizio, lt: fine }, fonte: "PDF" } }] },
    select: { invoiceId: true, ds: true, data: true, descrizione: true, quantita: true, prezzo: true, tasse: true, rateoIva: true, importoIva: true, totale: true, avere: true, microarea: true, macroarea: true, week: true, mese: true, anno: true },
  });
  const wb = excelCompleto(anno,
    linee.map((l) => ({ ds: l.ds, data: l.data, descrizione: l.descrizione, quantita: l.quantita, prezzo: Number(l.prezzo), tasse: l.tasse, rateo: Number(l.rateoIva), importoIva: Number(l.importoIva), totale: Number(l.totale), avere: Number(l.avere),
      microarea: l.microarea, macroarea: l.macroarea, week: l.week, mese: l.mese, anno: l.anno, numero: ids.get(l.invoiceId) ?? "" })),
    fatture.map((f) => ({ numero: f.numero, ds: f.ds, tipo: f.tipo, dataFattura: f.dataFattura, fonte: f.fonte, sommaAvere: Number(f.sommaAvere) })));
  const buf = await wb.xlsx.writeBuffer();
  await audit({ userId: user.id, action: "fatture.scarica-completo", entity: "AmazonInvoice", meta: { anno, fatture: fatture.length, righe: linee.length } });
  return new NextResponse(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${nomeFileCompleto(anno)}"`, "Cache-Control": "no-store" } });
}
