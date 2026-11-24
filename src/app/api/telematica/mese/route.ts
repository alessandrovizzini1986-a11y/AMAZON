import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireRole } from "@/lib/auth";
import { datiMese } from "@/lib/telematica/mese";

export const dynamic = "force-dynamic";

const ora = (iso: string | null) => (iso ? new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "");
const ore = (sec: number) => Math.round((sec / 3600) * 100) / 100;

/** Excel del mese: foglio "Riepilogo" (una riga per targa) e foglio "Giorni" (una riga per targa e giorno). Solo ADMIN. */
export async function GET(req: NextRequest) {
  await requireRole("ADMIN");
  const mese = req.nextUrl.searchParams.get("mese") ?? "";
  if (!/^\d{4}-\d\d$/.test(mese)) return NextResponse.json({ errore: "mese non valido" }, { status: 400 });
  const d = await datiMese(mese);
  const wb = new ExcelJS.Workbook(); wb.creator = "FleetDSP";
  const r = wb.addWorksheet("Riepilogo");
  r.columns = [["Targa", 11], ["Station", 9], ["Portale", 11], ["Giorni usati", 12], ["Km totali", 11], ["Km medi al giorno", 17], ["Ore di guida", 12], ["Ore fermo a motore acceso", 24], ["Velocità massima", 16], ["Punteggio sicurezza", 18], ["Soste", 8], ["Rifornimenti", 12], ["Litri", 9], ["Km per litro", 12], ["Litri per 100 km", 15], ["Primo giorno", 13], ["Ultimo giorno", 13]].map(([header, width]) => ({ header: header as string, width: width as number }));
  for (const x of d.riepilogo) r.addRow([x.targa, x.station ?? "", x.fonte === "TARGA" ? "Targa" : "FlottaWeb", x.giorniUsati, x.km, x.kmMedi, x.guidaOre, x.fermoMotoreAccOre, x.velMax ?? "", x.punteggio ?? "", x.soste, x.rifornimenti, x.litri, x.kmPerLitro ?? "", x.litri100km ?? "", x.primoGiorno ?? "", x.ultimoGiorno ?? ""]);
  const g = wb.addWorksheet("Giorni");
  g.columns = [["Targa", 11], ["Station", 9], ["Giorno", 12], ["Km", 9], ["Prima partenza", 14], ["Ultimo arrivo", 13], ["Ore di guida", 12], ["Ore motore acceso", 17], ["Ore fermo a motore acceso", 24], ["Velocità massima", 16], ["Soste", 8], ["Rifornimenti", 12], ["Litri", 9]].map(([header, width]) => ({ header: header as string, width: width as number }));
  for (const x of d.giorni) g.addRow([x.targa, d.stationDi(x.targa) ?? "", x.giorno, x.km, ora(x.inizio), ora(x.fine), ore(x.guidaSec), ore(x.motoreSec), ore(x.fermoMotoreAccSec), x.velMax ?? "", x.soste, x.rifornimenti, x.litri]);
  for (const ws of [r, g]) { ws.getRow(1).font = { bold: true }; ws.views = [{ state: "frozen", ySplit: 1 }]; ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } }; }
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="Telematica_${mese}.xlsx"`, "Cache-Control": "no-store" } });
}
