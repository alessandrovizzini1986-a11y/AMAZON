import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * Export Excel per la revisione mensile con manager/Amazon.
 * Ogni foglio riporta le righe sorgente (dive-deep, non solo aggregati).
 */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  assertCan(user, "export.full");

  const stationId = req.nextUrl.searchParams.get("station") || null;
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const oggi = new Date();

  const vehicles = await db.vehicle.findMany({
    where: { ...(stationId ? { stationId } : {}) },
    include: { station: true },
  });
  const vids = vehicles.map((v) => v.id);
  const vByI = new Map(vehicles.map((v) => [v.id, v]));

  const [fines, fuel, tolls, stations] = await Promise.all([
    db.fine.findMany({ where: { vehicleId: { in: vids }, dataOraInfrazione: { gte: since } }, include: { driver: true }, orderBy: { dataOraInfrazione: "asc" } }),
    db.fuelTransaction.findMany({ where: { data: { gte: since }, fuelCard: { vehicleId: { in: vids } } }, include: { fuelCard: true }, orderBy: { data: "asc" } }),
    db.tollTransaction.findMany({ where: { data: { gte: since }, ...(stationId ? { stationId } : {}) }, orderBy: { data: "asc" } }),
    db.station.findMany(),
  ]);
  const stCode = (id: string) => stations.find((s) => s.id === id)?.code ?? id;

  const wb = new ExcelJS.Workbook();
  wb.creator = "FleetDSP";

  const style = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((c) => (c.width = Math.max(14, String(c.header ?? "").length + 4)));
  };

  const wsMulte = wb.addWorksheet("Multe 30gg");
  wsMulte.columns = [
    { header: "Data/ora", key: "d" }, { header: "Targa", key: "t" }, { header: "Stazione", key: "s" },
    { header: "Violazione", key: "v" }, { header: "Importo €", key: "i" }, { header: "Punti", key: "p" },
    { header: "Conducente", key: "c" }, { header: "Fonte assegnazione", key: "f" }, { header: "Stato", key: "st" },
  ];
  for (const f of fines) {
    const v = vByI.get(f.vehicleId)!;
    wsMulte.addRow({
      d: f.dataOraInfrazione, t: v.targa, s: v.station.code, v: f.tipoViolazione, i: Number(f.importo),
      p: f.puntiPatente, c: f.driver ? `${f.driver.firstName} ${f.driver.lastName}` : "DA ASSEGNARE",
      f: f.assegnazioneFonte ?? "", st: f.stato,
    });
  }
  style(wsMulte);

  const wsFuel = wb.addWorksheet("Carburante 30gg");
  wsFuel.columns = [
    { header: "Data", key: "d" }, { header: "PAN", key: "p" }, { header: "Targa", key: "t" },
    { header: "Litri", key: "l" }, { header: "Importo €", key: "i" }, { header: "Punto vendita", key: "pv" },
  ];
  for (const t of fuel) {
    wsFuel.addRow({
      d: t.data, p: t.fuelCard.pan,
      t: t.fuelCard.vehicleId ? vByI.get(t.fuelCard.vehicleId)?.targa ?? "" : "non associata",
      l: Number(t.litri), i: Number(t.importo), pv: t.puntoVendita ?? "",
    });
  }
  style(wsFuel);

  const wsTolls = wb.addWorksheet("Pedaggi 30gg");
  wsTolls.columns = [
    { header: "Data", key: "d" }, { header: "Stazione", key: "s" }, { header: "Targa", key: "t" },
    { header: "Tratta", key: "tr" }, { header: "Importo €", key: "i" },
  ];
  for (const t of tolls) {
    wsTolls.addRow({ d: t.data, s: stCode(t.stationId), t: t.targa ?? "", tr: t.tratta ?? "", i: Number(t.importo) });
  }
  style(wsTolls);

  await audit({
    userId: user.id,
    action: "export.monthly",
    entity: "Export",
    meta: { stationId, righe: { multe: fines.length } },
  });

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const label = stationId ? stCode(stationId) : "cluster";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="fleetdsp_report_${label}_${oggi.toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
