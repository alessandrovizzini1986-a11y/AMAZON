/**
 * Variante Neon di scripts/import-multe-2025-2026.ts — stessa logica
 * (inclusa la creazione dei veicoli storici DISMESSO per targhe non più in
 * flotta), SQL parametrizzato via @neondatabase/serverless invece di Prisma.
 *
 * Uso: node scripts/import-multe-2025-2026-neon.mjs --env-file .env --file /path/Multe.xlsx
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

function cellText(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return String(v.result ?? "");
    return "";
  }
  return String(v).trim();
}
function excelTimeOfDay(v) {
  if (!(v instanceof Date)) return null;
  return { h: v.getUTCHours(), m: v.getUTCMinutes() };
}

function parseSheet(ws, anno) {
  const rows = [];
  const puntiAnomalie = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const targa = cellText(row.getCell(10).value).toUpperCase();
    if (!targa) return;
    const dataInfrazioneRaw = row.getCell(4).value;
    const dataInfrazione = dataInfrazioneRaw instanceof Date ? dataInfrazioneRaw : null;
    const ora = excelTimeOfDay(row.getCell(5).value);
    if (dataInfrazione && ora) dataInfrazione.setUTCHours(ora.h, ora.m, 0, 0);
    const dataNotificaRaw = row.getCell(6).value;
    const puntiVal = row.getCell(15).value;
    const puntiStr = cellText(puntiVal);
    if (puntiStr !== "SI" && puntiStr !== "NO" && puntiStr !== "") {
      puntiAnomalie.push({ anno, verbale: cellText(row.getCell(9).value), targa, puntiVal });
    }
    const importoVal = row.getCell(16).value;
    rows.push({
      anno, targa,
      verbale: cellText(row.getCell(9).value),
      driver: cellText(row.getCell(11).value).replace(/\s+/g, " ").trim(),
      tipoContratto: cellText(row.getCell(12).value),
      dataInfrazione,
      dataNotifica: dataNotificaRaw instanceof Date ? dataNotificaRaw : null,
      metodoPagamento: cellText(row.getCell(13).value).toUpperCase(),
      punti: puntiStr,
      importo: typeof importoVal === "number" ? importoVal : null,
      motivoMulta: cellText(row.getCell(18).value),
      motivoNormalizzato: cellText(row.getCell(21).value),
      citta: cellText(row.getCell(19).value),
      via: cellText(row.getCell(20).value),
      stationRaw: cellText(row.getCell(1).value),
    });
  });
  return { rows, puntiAnomalie };
}

const STATION_CODES = ["DER1", "DER2", "DLO2", "DLO4", "DLO5", "DLZ2", "DVN1", "GLS"];
function extractStationCode(raw) {
  const code = raw.trim().split(/\s*-\s*/)[0]?.toUpperCase();
  return code && STATION_CODES.includes(code) ? code : null;
}

async function main() {
  const filePath = arg("file");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const y2025 = parseSheet(wb.getWorksheet("2025"), 2025);
  const y2026 = parseSheet(wb.getWorksheet("2026"), 2026);
  const allRows = [...y2025.rows, ...y2026.rows];
  const puntiAnomalie = [...y2025.puntiAnomalie, ...y2026.puntiAnomalie];
  console.log(`Righe lette: 2025=${y2025.rows.length}, 2026=${y2026.rows.length}, totale=${allRows.length}`);
  if (puntiAnomalie.length) console.log("Anomalie colonna 'punti':", JSON.stringify(puntiAnomalie));

  const vehicles = await sql`SELECT id, targa FROM "Vehicle"`;
  const byTarga = new Map(vehicles.map((v) => [v.targa.toUpperCase(), v]));

  const stations = await sql`SELECT id, code FROM "Station"`;
  const stationIdByCode = new Map(stations.map((s) => [s.code, s.id]));

  const stationVotesByTarga = new Map();
  for (const r of allRows) {
    if (!byTarga.has(r.targa)) {
      const code = extractStationCode(r.stationRaw);
      if (code) {
        const votes = stationVotesByTarga.get(r.targa) ?? new Map();
        votes.set(code, (votes.get(code) ?? 0) + 1);
        stationVotesByTarga.set(r.targa, votes);
      }
    }
  }
  const missingTarghe = [...new Set(allRows.map((r) => r.targa).filter((t) => !byTarga.has(t)))];
  let veicoliStoriciCreati = 0;
  const senzaStazioneRiconoscibile = [];
  for (const targa of missingTarghe) {
    const votes = stationVotesByTarga.get(targa);
    const bestCode = votes ? [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
    const stationId = bestCode ? stationIdByCode.get(bestCode) : undefined;
    if (!stationId) { senzaStazioneRiconoscibile.push(targa); continue; }
    const id = crypto.randomUUID();
    await sql`INSERT INTO "Vehicle"
      (id, targa, modello, alimentazione, "hvoCompatibile", "stationId", stato, "kmAttuali", "createdAt", "updatedAt")
      VALUES (${id}, ${targa}, 'Veicolo storico (dati non disponibili — solo da import multe)', 'DIESEL', false, ${stationId}, 'DISMESSO', 0, now(), now())`;
    byTarga.set(targa, { id, targa });
    veicoliStoriciCreati++;
  }
  console.log(`Veicoli storici creati: ${veicoliStoriciCreati}`);
  if (senzaStazioneRiconoscibile.length) console.log("Targhe senza stazione riconoscibile:", senzaStazioneRiconoscibile);

  const existing = await sql`SELECT "verbaleNo" FROM "Fine" WHERE "verbaleNo" IS NOT NULL`;
  const seenVerbali = new Set(existing.map((f) => f.verbaleNo));

  let created = 0, skippedNotInDb = 0, skippedDuplicate = 0, skippedNoDate = 0, skippedNoImporto = 0;
  const notInDb = new Set();
  for (const r of allRows) {
    const v = byTarga.get(r.targa);
    if (!v) { skippedNotInDb++; notInDb.add(r.targa); continue; }
    if (r.verbale && seenVerbali.has(r.verbale)) { skippedDuplicate++; continue; }
    if (!r.dataInfrazione) { skippedNoDate++; continue; }
    if (r.importo == null) { skippedNoImporto++; continue; }
    if (r.verbale) seenVerbali.add(r.verbale);

    const luogo = [r.via, r.citta].filter(Boolean).join(", ") || "Non specificato";
    const tipoViolazione = r.motivoMulta || r.motivoNormalizzato || "Non specificato";
    const riaddebito = r.metodoPagamento.includes("TRATTENUTA IN BUSTA") ? "ADDEBITATO" : "NON_PREVISTO";
    const assegnazioneFonte = r.driver && r.driver !== "-"
      ? `import Excel multe ${r.anno} — nominativo: ${r.driver}${r.tipoContratto ? ` (contratto ${r.tipoContratto})` : ""}`
      : null;

    await sql`INSERT INTO "Fine"
      (id, "vehicleId", "verbaleNo", "dataOraInfrazione", luogo, "tipoViolazione", importo, stato,
       "dataNotifica", "driverId", "assegnazioneFonte", riaddebito, "importoRiaddebito", "createdAt", "updatedAt")
      VALUES (${crypto.randomUUID()}, ${v.id}, ${r.verbale || null}, ${r.dataInfrazione.toISOString()}, ${luogo},
        ${tipoViolazione}, ${r.importo}, 'NOTIFICATA', ${r.dataNotifica ? r.dataNotifica.toISOString() : null},
        null, ${assegnazioneFonte}, ${riaddebito}, ${riaddebito === "ADDEBITATO" ? r.importo : null}, now(), now())`;
    created++;
  }

  const [admin] = await sql`SELECT id FROM "User" WHERE role = 'ADMIN' LIMIT 1`;
  await sql`INSERT INTO "AuditLog" (id, "userId", action, entity, meta, "createdAt")
    VALUES (${crypto.randomUUID()}, ${admin?.id ?? null}, 'import.multe.2025_2026', 'Fine',
      ${JSON.stringify({ created, skippedNotInDb, skippedDuplicate, skippedNoDate, skippedNoImporto, targheNonInDb: [...notInDb], puntiAnomalie, veicoliStoriciCreati })}::jsonb, now())`;

  console.log("\n== Riepilogo (produzione) ==");
  console.log(`Fine creati: ${created}`);
  console.log(`Saltati (targa non in DB): ${skippedNotInDb}`, [...notInDb].slice(0, 30));
  console.log(`Saltati (duplicati): ${skippedDuplicate}`);
  console.log(`Saltati (senza data): ${skippedNoDate}`);
  console.log(`Saltati (senza importo): ${skippedNoImporto}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
