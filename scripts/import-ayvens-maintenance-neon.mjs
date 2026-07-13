/**
 * Variante Neon (HTTP) di scripts/import-ayvens-maintenance.ts — stessa logica
 * di parsing/match/aggiornamento, ma via SQL parametrizzato su
 * @neondatabase/serverless invece che Prisma Client (Prisma su TCP diretto
 * non raggiunge Neon da questo ambiente sandbox).
 *
 * Uso:
 *   NEON_URL=postgres://... node scripts/import-ayvens-maintenance-neon.mjs \
 *     --contracts /path/contracts.xlsx --maintenance /path/maintenanceList.xlsx
 */
import { neon } from "@neondatabase/serverless";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import ExcelJS from "exceljs";
import crypto from "node:crypto";
import fs from "node:fs";
import dotenv from "dotenv";

if (process.env.HTTPS_PROXY) setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`Argomento mancante: --${name}`);
  return process.argv[i + 1];
}

const envFileIdx = process.argv.indexOf("--env-file");
const envVars = envFileIdx >= 0
  ? dotenv.parse(fs.readFileSync(process.argv[envFileIdx + 1], "utf-8"))
  : process.env;
const connectionString = envVars.NEON_URL || envVars.DATABASE_URL;
const sql = neon(connectionString);

function parseItalianDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
}

function parseNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function extractTarga(veicolo) {
  const first = String(veicolo ?? "").trim().split(/\s+/)[0];
  return first ? first.toUpperCase() : null;
}

async function parseContracts(path) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet("Lista Contratti");
  const rows = [];
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

async function parseMaintenance(path) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet("Elenco Manutenzioni");
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const targa = extractTarga(row.getCell(2).value);
    const data = parseItalianDate(row.getCell(3).value);
    const tipologia = String(row.getCell(4).value ?? "").trim();
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

  const vehicles = await sql`SELECT id, targa, "contrattoLeasingNo", "kmAttuali" FROM "Vehicle" WHERE "leasingCompany" = 'ALD'`;
  const byTarga = new Map(vehicles.map((v) => [v.targa.toUpperCase(), v]));
  console.log(`Veicoli in DB con leasingCompany="ALD": ${vehicles.length}`);

  // ---- contratto + km attuali ----
  let ctrUpdated = 0, kmUpdated = 0;
  const notInDb = new Set();
  const contractByTarga = new Map();
  for (const c of contracts) contractByTarga.set(c.targa, c);
  for (const c of contractByTarga.values()) {
    const v = byTarga.get(c.targa);
    if (!v) { notInDb.add(c.targa); continue; }
    const kmRounded = c.kmUltimaManutenzione != null ? Math.round(c.kmUltimaManutenzione) : null;
    const newCtr = c.ctr && c.ctr !== v.contrattoLeasingNo ? c.ctr : null;
    const newKm = kmRounded != null && kmRounded > v.kmAttuali ? kmRounded : null;
    if (newCtr === null && newKm === null) continue;
    await sql`UPDATE "Vehicle" SET
      "contrattoLeasingNo" = COALESCE(${newCtr}, "contrattoLeasingNo"),
      "kmAttuali" = COALESCE(${newKm}, "kmAttuali"),
      "updatedAt" = now()
      WHERE id = ${v.id}`;
    if (newCtr) ctrUpdated++;
    if (newKm) kmUpdated++;
  }

  // ---- storico manutenzioni/gomme ----
  const vehicleIds = vehicles.map((v) => v.id);
  const existing = vehicleIds.length
    ? await sql`SELECT "vehicleId", tipo, data FROM "ServiceRecord" WHERE "vehicleId" = ANY(${vehicleIds})`
    : [];
  const seen = new Set(existing.map((e) => `${e.vehicleId}|${e.tipo}|${new Date(e.data).toISOString().slice(0, 10)}`));

  let created = 0, gommeCreated = 0, tagliandoCreated = 0;
  const maintNotInDb = new Set();
  for (const m of maintenance) {
    const v = byTarga.get(m.targa);
    if (!v) { maintNotInDb.add(m.targa); continue; }
    const tipo = m.tipologia === "PNEUS" ? "GOMME" : "TAGLIANDO";
    const dataIso = m.data.toISOString().slice(0, 10);
    const key = `${v.id}|${tipo}|${dataIso}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await sql`INSERT INTO "ServiceRecord"
      (id, "vehicleId", tipo, officina, data, "kmIntervento", costo, descrizione, "createdAt")
      VALUES (${crypto.randomUUID()}, ${v.id}, ${tipo}, 'Ayvens (rete convenzionata)', ${m.data.toISOString()}, 0, 0,
        'Import storico Ayvens — km intervento non disponibile dalla fonte, costo incluso nel canone di noleggio', now())`;
    created++;
    if (tipo === "GOMME") gommeCreated++; else tagliandoCreated++;
  }

  const [admin] = await sql`SELECT id FROM "User" WHERE role = 'ADMIN' LIMIT 1`;
  await sql`INSERT INTO "AuditLog" (id, "userId", action, entity, meta, "createdAt")
    VALUES (${crypto.randomUUID()}, ${admin?.id ?? null}, 'import.ayvens.maintenance', 'Vehicle',
      ${JSON.stringify({
        contrattiAggiornati: ctrUpdated,
        kmAggiornati: kmUpdated,
        serviceRecordCreati: created,
        targheContrattiNonInDb: [...notInDb],
        targheManutenzioniNonInDb: [...maintNotInDb],
      })}::jsonb, now())`;

  console.log("\n== Riepilogo (produzione) ==");
  console.log(`N° contratto aggiornato: ${ctrUpdated} veicoli`);
  console.log(`Km attuali aggiornato: ${kmUpdated} veicoli`);
  console.log(`Targhe nel file contratti non presenti nel nostro DB: ${notInDb.size}`);
  console.log(`ServiceRecord creati: ${created} (GOMME: ${gommeCreated}, TAGLIANDO: ${tagliandoCreated})`);
  console.log(`Targhe nel file manutenzioni non presenti nel nostro DB: ${maintNotInDb.size}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
