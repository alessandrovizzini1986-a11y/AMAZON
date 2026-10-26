import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { applyFiltri, countCentri, describeFiltri, EMPTY_FILTRI, filtriFromParams, LABELS, type Centro } from "@/domain/officine";

const COLUMNS: { key: keyof Centro; width: number }[] = [
  { key: "ragioneSociale", width: 42 },
  { key: "regione", width: 18 },
  { key: "localita", width: 24 },
  { key: "provincia", width: 16 },
  { key: "indirizzo", width: 38 },
  { key: "officina", width: 10 },
  { key: "carrozzeria", width: 12 },
  { key: "rete", width: 16 },
  { key: "tuttiBrand", width: 14 },
  { key: "transit", width: 14 },
];

/** Excel dei centri Ayvens: le righe filtrate come nella pagina (o tutte con ?tutto=1). */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!can(user, "officine.view")) return NextResponse.json({ error: "Permesso negato" }, { status: 403 });

  const tutto = req.nextUrl.searchParams.get("tutto") === "1";
  const filtri = tutto ? EMPTY_FILTRI : filtriFromParams(req.nextUrl.searchParams);
  const all = await db.serviceCenter.findMany();
  const rows = applyFiltri(all, filtri);
  const fonte = all[0]?.fonte ?? "—";
  const caricato = all.reduce<Date | null>((m, c) => (!m || c.createdAt > m ? c.createdAt : m), null);

  const wb = new ExcelJS.Workbook();
  wb.creator = "FleetDSP";
  const ws = wb.addWorksheet("Centri Ayvens", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: LABELS[c.key], key: c.key, width: c.width }));
  for (const r of rows) {
    ws.addRow(Object.fromEntries(COLUMNS.map((c) => [c.key, typeof r[c.key] === "boolean" ? (r[c.key] ? "Si" : "No") : r[c.key]])));
  }
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123E73" } };
  head.alignment = { vertical: "middle", wrapText: true };
  head.height = 30;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: COLUMNS.length } };

  const info = wb.addWorksheet("Filtri");
  info.columns = [{ width: 32 }, { width: 70 }];
  info.addRows([
    ["Lista centri autorizzati Ayvens — veicoli commerciali"],
    [],
    ["File Ayvens", fonte],
    ["Caricato il", caricato ? caricato.toLocaleDateString("it-IT") : "—"],
    ["Esportato il", new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })],
    ["Righe", rows.length],
    ["Centri unici", countCentri(rows)],
    [],
    ["Filtri applicati", tutto ? "Nessuno (elenco completo)" : ""],
    ...(tutto ? [] : describeFiltri(filtri)),
  ]);
  info.getRow(1).font = { bold: true, size: 14 };
  info.getColumn(1).font = { bold: true };

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const oggi = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="centri_ayvens_${tutto ? "completo" : "selezione"}_${oggi}.xlsx"`,
    },
  });
}
