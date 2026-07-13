/**
 * Import una tantum di manutenzioni/gomme + N° contratto + km attuali da
 * export Ayvens (ex ALD) — "Lista Contratti" e "Elenco Manutenzioni" —
 * per il cliente "Professional Solutions Srl", solo contratti Lungo
 * Termine (nel nostro DB: leasingCompany="ALD"). I contratti "ALD MT"
 * (Medio Termine) non compaiono in questi export e restano intoccati.
 *
 * Uso:
 *   npx tsx scripts/import-ayvens-maintenance.ts --contracts /path/contracts.xlsx --maintenance /path/maintenanceList.xlsx
 *
 * Comportamento:
 *  - match per targa (Vehicle.leasingCompany === "ALD") tra i due file e il DB
 *  - aggiorna contrattoLeasingNo (colonna CTR) e kmAttuali (Km Ultima
 *    Manutenzione, unica colonna valorizzata per tutte le righe — la
 *    colonna "Km Ultimo Rilevamento Manuale" è quasi sempre vuota e,
 *    quando presente, meno recente) solo se il valore cresce
 *  - crea uno ServiceRecord per ogni evento dell'Elenco Manutenzioni
 *    (PNEUS -> GOMME, MECH -> TAGLIANDO); costo=0 perché incluso nel
 *    canone di noleggio, kmIntervento=0 perché non presente nella fonte
 *  - idempotente: non duplica ServiceRecord già inseriti (vehicleId+tipo+data)
 */
import ExcelJS from "exceljs";
import { PrismaClient, ServiceType } from "@prisma/client";

const prisma = new PrismaClient();

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`Argomento mancante: --${name}`);
  return process.argv[i + 1];
}

function parseItalianDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
}

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function extractTarga(veicolo: unknown): string | null {
  const first = String(veicolo ?? "").trim().split(/\s+/)[0];
  return first ? first.toUpperCase() : null;
}

type ContractRow = { targa: string; ctr: string; dataUltimaManutenzione: Date | null; kmUltimaManutenzione: number | null };
type MaintenanceRow = { targa: string; data: Date; tipologia: "PNEUS" | "MECH" };

async function parseContracts(path: string): Promise<ContractRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet("Lista Contratti")!;
  const rows: ContractRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const targa = String(row.getCell(5).value ?? "").trim().toUpperCase();
    if (!targa) return;
    rows.push({
      targa,
      ctr: String(row.getCell(3).value ?? "").trim(),
      dataUltimaManutenzione: parseItalianDate(row.getCell(23).value),
      kmUltimaManutenzione: parseNum(row.getCell(24).value),
    });
  });
  return rows;
}

async function parseMaintenance(path: string): Promise<MaintenanceRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet("Elenco Manutenzioni")!;
  const rows: MaintenanceRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const targa = extractTarga(row.getCell(2).value);
    const data = parseItalianDate(row.getCell(3).value);
    const tipologia = String(row.getCell(4).value ?? "").trim() as "PNEUS" | "MECH";
    if (!targa || !data || (tipologia !== "PNEUS" && tipologia !== "MECH")) return;
    rows.push({ targa, data, tipologia });
  });
  return rows;
}

async function main() {
  const contractsPath = arg("contracts");
  const maintenancePath = arg("maintenance");

  const contracts = await parseContracts(contractsPath);
  const maintenance = await parseMaintenance(maintenancePath);
  console.log(`Contratti letti: ${contracts.length} righe (${new Set(contracts.map((c) => c.targa)).size} targhe uniche)`);
  console.log(`Manutenzioni lette: ${maintenance.length} righe (${new Set(maintenance.map((m) => m.targa)).size} targhe uniche)`);

  const vehicles = await prisma.vehicle.findMany({
    where: { leasingCompany: "ALD" },
    select: { id: true, targa: true, contrattoLeasingNo: true, kmAttuali: true },
  });
  const byTarga = new Map(vehicles.map((v) => [v.targa.toUpperCase(), v]));
  console.log(`Veicoli in DB con leasingCompany="ALD": ${vehicles.length}`);

  // ---- contratto + km attuali ----
  let ctrUpdated = 0, kmUpdated = 0, notInDb = new Set<string>(), noDateInFile = 0;
  const contractByTarga = new Map<string, ContractRow>();
  for (const c of contracts) contractByTarga.set(c.targa, c); // una riga per targa nel file
  for (const c of contractByTarga.values()) {
    const v = byTarga.get(c.targa);
    if (!v) { notInDb.add(c.targa); continue; }
    if (!c.dataUltimaManutenzione || c.kmUltimaManutenzione == null) { noDateInFile++; }
    const data: { contrattoLeasingNo?: string; kmAttuali?: number } = {};
    if (c.ctr && c.ctr !== v.contrattoLeasingNo) data.contrattoLeasingNo = c.ctr;
    const kmRounded = c.kmUltimaManutenzione != null ? Math.round(c.kmUltimaManutenzione) : null;
    if (kmRounded != null && kmRounded > v.kmAttuali) data.kmAttuali = kmRounded;
    if (Object.keys(data).length > 0) {
      await prisma.vehicle.update({ where: { id: v.id }, data });
      if (data.contrattoLeasingNo) ctrUpdated++;
      if (data.kmAttuali) kmUpdated++;
    }
  }

  // ---- storico manutenzioni/gomme ----
  const existing = await prisma.serviceRecord.findMany({
    where: { vehicleId: { in: vehicles.map((v) => v.id) } },
    select: { vehicleId: true, tipo: true, data: true },
  });
  const seen = new Set(existing.map((e) => `${e.vehicleId}|${e.tipo}|${e.data.toISOString().slice(0, 10)}`));

  const toCreate: { vehicleId: string; tipo: ServiceType; officina: string; data: Date; kmIntervento: number; costo: number; descrizione: string }[] = [];
  let maintNotInDb = new Set<string>();
  for (const m of maintenance) {
    const v = byTarga.get(m.targa);
    if (!v) { maintNotInDb.add(m.targa); continue; }
    const key = `${v.id}|${m.tipologia === "PNEUS" ? "GOMME" : "TAGLIANDO"}|${m.data.toISOString().slice(0, 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    toCreate.push({
      vehicleId: v.id,
      tipo: m.tipologia === "PNEUS" ? ServiceType.GOMME : ServiceType.TAGLIANDO,
      officina: "Ayvens (rete convenzionata)",
      data: m.data,
      kmIntervento: 0,
      costo: 0,
      descrizione: "Import storico Ayvens — km intervento non disponibile dalla fonte, costo incluso nel canone di noleggio",
    });
  }
  if (toCreate.length > 0) await prisma.serviceRecord.createMany({ data: toCreate });

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  await prisma.auditLog.create({
    data: {
      userId: admin?.id ?? null,
      action: "import.ayvens.maintenance",
      entity: "Vehicle",
      meta: {
        contrattiAggiornati: ctrUpdated,
        kmAggiornati: kmUpdated,
        serviceRecordCreati: toCreate.length,
        targheContrattiNonInDb: [...notInDb],
        targheManutenzioniNonInDb: [...maintNotInDb],
      },
    },
  });

  console.log("\n== Riepilogo ==");
  console.log(`N° contratto aggiornato: ${ctrUpdated} veicoli`);
  console.log(`Km attuali aggiornato: ${kmUpdated} veicoli`);
  console.log(`Targhe nel file contratti non presenti nel nostro DB: ${notInDb.size}`, [...notInDb].slice(0, 30));
  console.log(`Righe manutenzione senza data valida: ${noDateInFile}`);
  console.log(`ServiceRecord creati: ${toCreate.length} (di cui GOMME: ${toCreate.filter((r) => r.tipo === "GOMME").length}, TAGLIANDO: ${toCreate.filter((r) => r.tipo === "TAGLIANDO").length})`);
  console.log(`Targhe nel file manutenzioni non presenti nel nostro DB: ${maintNotInDb.size}`, [...maintNotInDb].slice(0, 30));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
