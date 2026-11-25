import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireRole } from "@/lib/auth";
import { datiRiconciliazione } from "@/lib/carburante/riconciliazione";
import { filtraRighe, isMeseValido, leggiFiltro } from "@/lib/carburante/filtro";
import { COLONNE_EXPORT, csvRighe, nomeFileExport } from "@/lib/carburante/esporta";
import { ETICHETTA_STATO, ORDINE_STATI } from "@/domain/carburante/riconciliazione";
import { etichettaMese } from "@/lib/mesi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FORMATO_NUM = { litri: "0.0", euro: "#,##0.00", km: "0.0", data: "dd/mm/yyyy", testo: "@" } as const;

/**
 * Export della pagina "Carburante: Q8 e telematica" con gli stessi filtri: mese, flotta, targa, regolari, nonverificabili,
 * archiviate; formato=xlsx (predefinito) o csv. Solo ADMIN.
 */
export async function GET(req: NextRequest) {
  const user = await requireRole("ADMIN");
  // la voce di menu tolta dal super admin vale anche per il suo export
  if (user.nascosti?.includes("/telematica/carburante")) return NextResponse.json({ errore: "pagina non disponibile" }, { status: 403 });
  const p = req.nextUrl.searchParams;
  const mese = p.get("mese");
  if (!isMeseValido(mese)) return NextResponse.json({ errore: "mese non valido: usa AAAA-MM" }, { status: 400 });
  const formato = p.get("formato") === "csv" ? "csv" : "xlsx";
  const f = leggiFiltro(p, mese);
  const dati = await datiRiconciliazione(mese);
  const righe = filtraRighe(dati.righe, f);
  const intestazioni = { "Content-Disposition": `attachment; filename="${nomeFileExport(mese, formato)}"`, "Cache-Control": "no-store" };

  if (formato === "csv") {
    return new NextResponse(csvRighe(righe), { headers: { ...intestazioni, "Content-Type": "text/csv; charset=utf-8" } });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "FleetDSP";
  const ws = wb.addWorksheet("Incrocio Q8 Targa");
  ws.columns = COLONNE_EXPORT.map((c) => ({ header: c.nome, width: c.larghezza, style: c.tipo === "testo" ? {} : { numFmt: FORMATO_NUM[c.tipo] } }));
  for (const r of righe) {
    ws.addRow(COLONNE_EXPORT.map((c) => {
      const v = c.valore(r);
      if (v === null || v === undefined) return null;
      if (c.tipo === "data" && typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v)) return new Date(`${v}T00:00:00Z`);
      return v;
    }));
  }
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle", wrapText: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLONNE_EXPORT.length } };

  // secondo foglio: i numeri delle schede e i filtri usati
  const rie = wb.addWorksheet("Riepilogo");
  rie.columns = [{ header: "Voce", width: 42 }, { header: "Tutte", width: 12 }, { header: "DER2", width: 12 }, { header: "GLS", width: 12 }];
  const k = ["TUTTE", "DER2", "GLS"] as const;
  rie.addRow(["Transazioni Q8 analizzate", ...k.map((x) => dati.riepilogo[x].pagamentiQ8)]);
  rie.addRow(["Anomalie", ...k.map((x) => dati.riepilogo[x].anomalie)]);
  for (const s of ORDINE_STATI) rie.addRow([`  ${ETICHETTA_STATO[s]}`, ...k.map((x) => dati.riepilogo[x].perStato[s])]);
  const litri = rie.addRow(["Litri non giustificati", ...k.map((x) => dati.riepilogo[x].litriMancanti)]);
  const euro = rie.addRow(["Valore stimato dell'ammanco € (IVA esclusa)", ...k.map((x) => dati.riepilogo[x].euroMancanti)]);
  litri.eachCell((c, i) => { if (i > 1) c.numFmt = "0.0"; });
  euro.eachCell((c, i) => { if (i > 1) c.numFmt = "#,##0.00"; });
  rie.addRow([]);
  rie.addRow(["Mese", etichettaMese(mese)]);
  rie.addRow(["Flotta", f.flotta === "TUTTE" ? "Tutte" : f.flotta]);
  rie.addRow(["Targa", f.targa ?? "Tutte"]);
  rie.addRow(["Regolari inclusi", f.regolari ? "Sì" : "No"]);
  rie.addRow(["Non verificabili inclusi", f.nonVerificabili ? "Sì" : "No"]);
  rie.addRow(["Archiviate incluse", f.archiviate ? "Sì" : "No"]);
  rie.addRow(["Righe esportate", righe.length]);
  rie.addRow(["Nota", "Le righe archiviate non contano tra anomalie, litri e valore."]);
  rie.getRow(1).font = { bold: true };
  rie.views = [{ state: "frozen", ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, { headers: { ...intestazioni, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
}
