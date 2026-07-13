/**
 * Variante Neon di scripts/import-danni-2025.ts — stessa logica, SQL
 * parametrizzato via @neondatabase/serverless invece di Prisma Client.
 *
 * Uso: node scripts/import-danni-2025-neon.mjs --env-file .env --file /path/danni_e_denuncia.xlsx
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
const envVars = envFileIdx >= 0 ? dotenv.parse(fs.readFileSync(process.argv[envFileIdx + 1], "utf-8")) : process.env;
const sql = neon(envVars.NEON_URL || envVars.DATABASE_URL);

function parseUsDateTime(v) {
  if (v instanceof Date) return v;
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, mo, d, y, h, mi, se] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +(h ?? 0), +(mi ?? 0), +(se ?? 0)));
}
function normalizeBlank(v) {
  const s = String(v ?? "").trim();
  return s.toUpperCase() === "BLANK" ? "" : s;
}

async function main() {
  const filePath = arg("file");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet("Elenco Denunce Sinistri");

  const rows = [];
  let deleted = 0, noTarga = 0;
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const stato = String(row.getCell(6).value ?? "").trim();
    if (stato === "DELETED") { deleted++; return; }
    const targa = String(row.getCell(2).value ?? "").trim().toUpperCase();
    if (!targa) { noTarga++; return; }
    rows.push({
      numeroDenuncia: String(row.getCell(1).value ?? "").trim(),
      targa,
      dataEvento: parseUsDateTime(row.getCell(4).value),
      tipologia: String(row.getCell(5).value ?? "").trim(),
      stato,
      localita: String(row.getCell(7).value ?? "").trim(),
      descrizioneEvento: normalizeBlank(row.getCell(9).value),
      descrizioneDanni: normalizeBlank(row.getCell(10).value),
    });
  });
  console.log(`Righe lette: ${rows.length} valide, ${deleted} DELETED scartate, ${noTarga} senza targa scartate`);

  const vehicles = await sql`SELECT id, targa FROM "Vehicle"`;
  const byTarga = new Map(vehicles.map((v) => [v.targa.toUpperCase(), v]));

  const existing = await sql`SELECT "praticaAssicurativa" FROM "Damage" WHERE "praticaAssicurativa" IS NOT NULL`;
  const seenPratiche = new Set(existing.map((d) => d.praticaAssicurativa));

  let created = 0, skippedNotInDb = 0, skippedDuplicate = 0, skippedNoDate = 0;
  const notInDb = new Set();
  for (const r of rows) {
    const v = byTarga.get(r.targa);
    if (!v) { skippedNotInDb++; notInDb.add(r.targa); continue; }
    if (r.numeroDenuncia && seenPratiche.has(r.numeroDenuncia)) { skippedDuplicate++; continue; }
    if (!r.dataEvento) { skippedNoDate++; continue; }
    seenPratiche.add(r.numeroDenuncia);

    const responsabilita = r.tipologia === "Senza Controparte" ? "DRIVER" : "IGNOTO";
    const descrizione = [r.descrizioneEvento, r.localita ? `Località: ${r.localita}` : null].filter(Boolean).join(" — ") || null;

    await sql`INSERT INTO "Damage"
      (id, "vehicleId", tipo, data, descrizione, responsabilita, "praticaAssicurativa", chiuso, "createdAt")
      VALUES (${crypto.randomUUID()}, ${v.id}, ${r.descrizioneDanni || r.tipologia || "Danno non specificato"},
        ${r.dataEvento.toISOString()}, ${descrizione}, ${responsabilita}, ${r.numeroDenuncia || null}, ${r.stato === "CLOSED"}, now())`;
    created++;
  }

  const [admin] = await sql`SELECT id FROM "User" WHERE role = 'ADMIN' LIMIT 1`;
  await sql`INSERT INTO "AuditLog" (id, "userId", action, entity, meta, "createdAt")
    VALUES (${crypto.randomUUID()}, ${admin?.id ?? null}, 'import.danni.denunce', 'Damage',
      ${JSON.stringify({ created, skippedNotInDb, skippedDuplicate, skippedNoDate, targheNonInDb: [...notInDb] })}::jsonb, now())`;

  console.log("\n== Riepilogo (produzione) ==");
  console.log(`Damage creati: ${created}`);
  console.log(`Saltati (targa non in DB): ${skippedNotInDb}`, [...notInDb]);
  console.log(`Saltati (duplicati): ${skippedDuplicate}`);
  console.log(`Saltati (senza data): ${skippedNoDate}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
