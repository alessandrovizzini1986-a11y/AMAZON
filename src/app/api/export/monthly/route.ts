import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getConfigStringArray } from "@/lib/config";

const STATO_LABEL: Record<string, string> = {
  ATTIVO: "Attivo",
  IN_OFFICINA: "In officina",
  SOSTITUTIVO: "Sostitutivo",
  UFFICIO: "Ufficio",
  DISMESSO: "Dismesso",
};

/**
 * Export Excel della flotta: riepilogo per stazione (veicoli + canone mensile,
 * Amazon e altri appalti distinti) e l'elenco delle targhe non dismesse.
 */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  assertCan(user, "export.full");

  const stationId = req.nextUrl.searchParams.get("station") || null;
  const oggi = new Date();

  const [vehicles, stations, stazioniNonAmazon] = await Promise.all([
    db.vehicle.findMany({
      where: { stato: { not: "DISMESSO" }, ...(stationId ? { stationId } : {}) },
      include: { station: true },
      orderBy: [{ station: { code: "asc" } }, { targa: "asc" }],
    }),
    db.station.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    getConfigStringArray("appalto.nonAmazon.stationCodes"),
  ]);
  const appalto = (code: string) => (stazioniNonAmazon.includes(code) ? code : "Amazon");

  const wb = new ExcelJS.Workbook();
  wb.creator = "FleetDSP";
  const header = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };
  const EUR = '#,##0.00 "€"';

  // ---- riepilogo per stazione (sostitutivi esclusi: coprono un guasto già conteggiato) ----
  const wsSum = wb.addWorksheet("Riepilogo stazioni");
  wsSum.columns = [
    { header: "Stazione", key: "code", width: 12 },
    { header: "Nome", key: "name", width: 24 },
    { header: "Appalto", key: "appalto", width: 12 },
    { header: "Veicoli in flotta", key: "veicoli", width: 18 },
    { header: "Canone mensile €", key: "canone", width: 18, style: { numFmt: EUR } },
  ];
  const inFlotta = vehicles.filter((v) => v.stato !== "SOSTITUTIVO");
  const stationList = stationId ? stations.filter((s) => s.id === stationId) : stations;
  let totV = 0, totC = 0;
  for (const s of stationList) {
    const vs = inFlotta.filter((v) => v.stationId === s.id);
    const canone = vs.reduce((t, v) => t + Number(v.canoneMese ?? 0), 0);
    totV += vs.length; totC += canone;
    wsSum.addRow({ code: s.code, name: s.name, appalto: appalto(s.code), veicoli: vs.length, canone });
  }
  wsSum.addRow({ code: "Totale", veicoli: totV, canone: totC }).font = { bold: true };
  header(wsSum);

  // ---- elenco veicoli ----
  const wsV = wb.addWorksheet("Veicoli");
  wsV.columns = [
    { header: "Targa", key: "targa", width: 12 },
    { header: "Stazione", key: "stazione", width: 10 },
    { header: "Appalto", key: "appalto", width: 10 },
    { header: "Modello", key: "modello", width: 22 },
    { header: "Stato", key: "stato", width: 13 },
    { header: "Noleggio", key: "noleggio", width: 14 },
    { header: "N° contratto", key: "contratto", width: 16 },
    { header: "Inizio contratto", key: "inizio", width: 16, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Fine contratto", key: "fine", width: 16, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Canone mensile €", key: "canone", width: 18, style: { numFmt: EUR } },
  ];
  for (const v of vehicles) {
    wsV.addRow({
      targa: v.targa,
      stazione: v.station.code,
      appalto: appalto(v.station.code),
      modello: v.modello,
      stato: STATO_LABEL[v.stato] ?? v.stato,
      noleggio: v.leasingCompany ?? "",
      contratto: v.contrattoLeasingNo ?? "",
      inizio: v.contrattoDataInizio ?? null,
      fine: v.contrattoDataFine ?? null,
      canone: v.canoneMese !== null ? Number(v.canoneMese) : null,
    });
  }
  header(wsV);
  wsV.autoFilter = { from: "A1", to: "J1" };

  await audit({
    userId: user.id,
    action: "export.monthly",
    entity: "Export",
    meta: { stationId, righe: { veicoli: vehicles.length } },
  });

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const label = stationId ? stations.find((s) => s.id === stationId)?.code ?? "stazione" : "cluster";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="fleetdsp_flotta_${label}_${oggi.toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
