/**
 * Variante Neon (HTTP) dello script scripts/import-real-fleet.ts.
 * Stessa logica di parsing/normalizzazione, ma esegue via SQL parametrizzato
 * su @neondatabase/serverless invece che via Prisma Client (Prisma su TCP
 * diretto verso Neon non è raggiungibile da questo ambiente sandbox).
 */
import { neon } from "@neondatabase/serverless";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import fs from "node:fs";
import crypto from "node:crypto";

if (process.env.HTTPS_PROXY) setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));
const sql = neon(process.env.NEON_URL);

function parseItalianDecimal(raw) {
  const s = (raw ?? "").trim();
  if (!s || s === "-") return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseDate(raw) {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]), y = Number(m[3]);
  const [day, month] = b > 12 ? [b, a] : [a, b];
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const PLATE_RE = /^[A-Z0-9]{5,8}$/;
function extractPlateRef(note) {
  const first = note.trim().split(/[\s,\-–]/)[0]?.toUpperCase();
  if (first && PLATE_RE.test(first) && /\d/.test(first)) return first;
  return null;
}

const BRAND_FIX = {
  PEOUGET: "Peugeot", PEUGEUT: "Peugeot", PEUGEOT: "Peugeot",
  VOLSWAGEN: "Volkswagen", VOLKSWAGEN: "Volkswagen",
  IVECO: "Iveco", FORD: "Ford", FIAT: "Fiat", OPEL: "Opel",
  RENAULT: "Renault", CITROEN: "Citroen", TOYOTA: "Toyota",
  MAXUS: "Maxus", RAP: "Rap",
};
function fixBrand(raw) {
  const key = (raw ?? "").trim().toUpperCase();
  return BRAND_FIX[key] ?? ((raw ?? "").trim().charAt(0).toUpperCase() + (raw ?? "").trim().slice(1).toLowerCase());
}

const COMPANY_FIX = {
  HERZ: "Hertz", HERTZ: "Hertz", EUROPCAR: "Europcar",
  AVIS: "Avis", ARVAL: "Arval", NOLEGGIARE: "Noleggiare",
  TORENTAL: "Torental", VEM: "Vem",
};
function fixCompany(raw) {
  const key = (raw ?? "").trim().toUpperCase();
  return COMPANY_FIX[key] ?? (raw ?? "").trim();
}

const STATO_MAP = { ATTIVO: "ATTIVO", SOSTITUTIVO: "SOSTITUTIVO", UFFICIO: "UFFICIO" };
const TIPO_MAP = { MT: "MT", LT: "LT", BT: "BT", SOST: "SOST", UFFICIO: "UFFICIO" };

function parseTsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const [, ...dataLines] = lines;
  const rows = [];
  for (const line of dataLines) {
    const cols = line.split("\t");
    const [targaRaw, dsRaw, marcaRaw, modelloRaw, statoRaw, societaRaw, tipoRaw, raRaw, dataInizioRaw, dataFineRaw, noteRaw, tariffaRaw, , frDanniRaw] = cols;
    const targa = (targaRaw ?? "").trim().toUpperCase();
    if (!targa) continue;
    const dsMatch = (dsRaw ?? "").split(" - ");
    const stationCode = (dsMatch[0] ?? "").trim().toUpperCase();
    const stationName = (dsMatch.slice(1).join(" - ") || stationCode).trim();
    if (!stationCode) continue;
    const statoKey = (statoRaw ?? "").trim().toUpperCase();
    const stato = STATO_MAP[statoKey] ?? "ATTIVO";
    const note = (noteRaw ?? "").trim() || null;
    const isElettrico = /ELETTRIC/i.test(note ?? "") || /E-TRANSIT|E-DELIVER|AGILE L/i.test(modelloRaw ?? "");
    rows.push({
      targa, stationCode, stationName,
      marca: fixBrand(marcaRaw), modello: (modelloRaw ?? "").trim(), stato,
      leasingCompany: societaRaw ? fixCompany(societaRaw) : null,
      tipoContratto: TIPO_MAP[(tipoRaw ?? "").trim().toUpperCase()] ?? null,
      contrattoLeasingNo: (raRaw ?? "").trim() || null,
      contrattoDataInizio: parseDate(dataInizioRaw),
      contrattoDataFine: parseDate(dataFineRaw),
      note,
      canoneMese: parseItalianDecimal(tariffaRaw),
      franchigiaDanni: parseItalianDecimal(frDanniRaw),
      isElettrico,
      originalPlateRef: stato === "SOSTITUTIVO" && note ? extractPlateRef(note) : null,
    });
  }
  return rows;
}

async function main() {
  const fileArgIdx = process.argv.indexOf("--file");
  const filePath = fileArgIdx >= 0 ? process.argv[fileArgIdx + 1] : null;
  if (!filePath) throw new Error("Uso: node import-real-fleet-neon.mjs --file <path.tsv>");

  // guardia anti-cancellazione accidentale: questo script è pensato per la
  // sostituzione una tantum dei dati demo, non per un rilancio dopo che sono
  // stati importati dati operativi reali (multe, danni, tagliandi, movimenti)
  const [{ count: multe }] = await sql.query(`SELECT COUNT(*)::int AS count FROM "Fine"`);
  const [{ count: danni }] = await sql.query(`SELECT COUNT(*)::int AS count FROM "Damage"`);
  const [{ count: tagliandi }] = await sql.query(`SELECT COUNT(*)::int AS count FROM "ServiceRecord"`);
  const [{ count: movimenti }] = await sql.query(`SELECT COUNT(*)::int AS count FROM "Assignment"`);
  const hasLiveData = [multe, danni, tagliandi, movimenti].some((n) => n > 0);
  if (hasLiveData && !process.argv.includes("--confirm-delete-live-data")) {
    console.error("\n⚠️  Rilevati dati operativi reali già presenti nel database:");
    console.error(`   multe: ${multe}, danni: ${danni}, tagliandi: ${tagliandi}, movimenti: ${movimenti}`);
    console.error("   Questo script cancella l'intera flotta e tutti i dati transazionali prima di reimportare.");
    console.error("   Se sei sicuro di voler procedere comunque, rilancia con --confirm-delete-live-data\n");
    process.exit(1);
  }

  const rows = parseTsv(filePath);
  console.log(`Righe lette: ${rows.length}`);

  const seen = new Set();
  const uniqueRows = [];
  let duplicati = 0;
  for (const r of rows) {
    if (seen.has(r.targa)) { duplicati++; continue; }
    seen.add(r.targa);
    uniqueRows.push(r);
  }
  console.log(`Targhe uniche: ${uniqueRows.length} (${duplicati} duplicate scartate)`);

  console.log("\n== Pulizia dati demo (mantiene Admin e AppConfig) ==");
  await sql.query(`DELETE FROM "AuditLog"`);
  await sql.query(`DELETE FROM "ImportJob"`);
  await sql.query(`DELETE FROM "FuelTransaction"`);
  await sql.query(`DELETE FROM "TollTransaction"`);
  await sql.query(`DELETE FROM "FuelCard"`);
  await sql.query(`DELETE FROM "Damage"`);
  await sql.query(`DELETE FROM "ReplacementCase"`);
  await sql.query(`DELETE FROM "StationTransfer"`);
  await sql.query(`DELETE FROM "Assignment"`);
  await sql.query(`DELETE FROM "Fine"`);
  await sql.query(`DELETE FROM "ServiceRecord"`);
  await sql.query(`DELETE FROM "VehicleStationHistory"`);
  await sql.query(`DELETE FROM "Vehicle"`);
  await sql.query(`DELETE FROM "User" WHERE role != 'ADMIN'`);
  await sql.query(`DELETE FROM "Station"`);
  console.log("Dati demo rimossi.");

  console.log("\n== Stazioni reali ==");
  const stationCodes = [...new Set(uniqueRows.map((r) => r.stationCode))].sort();
  const stationByCode = new Map();
  for (const code of stationCodes) {
    const name = uniqueRows.find((r) => r.stationCode === code).stationName;
    const id = crypto.randomUUID();
    await sql.query(`INSERT INTO "Station" (id, code, name, active, "createdAt") VALUES ($1,$2,$3,true,now())`, [id, code, name]);
    stationByCode.set(code, id);
    console.log(`  ${code} — ${name}`);
  }

  console.log("\n== Veicoli ==");
  const vehicleIdByTarga = new Map();
  let created = 0;
  for (const r of uniqueRows) {
    const stationId = stationByCode.get(r.stationCode);
    if (!stationId) { console.log(`  SALTATO ${r.targa}: stazione non risolta`); continue; }
    const id = crypto.randomUUID();
    await sql.query(
      `INSERT INTO "Vehicle"
        (id, targa, modello, alimentazione, "hvoCompatibile", "stationId", stato, "kmAttuali",
         "canoneMese", "franchigiaDanni", "leasingCompany", "contrattoLeasingNo", "tipoContratto",
         "contrattoDataInizio", "contrattoDataFine", note, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,false,$5,$6,0,$7,$8,$9,$10,$11,$12,$13,$14,now(),now())`,
      [
        id, r.targa, `${r.marca} ${r.modello}`.trim(), r.isElettrico ? "ELETTRICO" : "DIESEL",
        stationId, r.stato, r.canoneMese, r.franchigiaDanni, r.leasingCompany, r.contrattoLeasingNo,
        r.tipoContratto, r.contrattoDataInizio, r.contrattoDataFine, r.note,
      ]
    );
    await sql.query(
      `INSERT INTO "VehicleStationHistory" (id, "vehicleId", "stationId", "fromDate", note)
       VALUES ($1,$2,$3,now(),'import flotta reale')`,
      [crypto.randomUUID(), id, stationId]
    );
    vehicleIdByTarga.set(r.targa, id);
    created++;
  }
  console.log(`Veicoli creati: ${created}`);

  console.log("\n== Pratiche sostitutivo ==");
  let casesCreated = 0, skippedNoOriginal = 0, skippedDup = 0;
  const seenCaseKey = new Set();
  for (const r of uniqueRows) {
    if (r.stato !== "SOSTITUTIVO" || !r.originalPlateRef) continue;
    const originalVehicleId = vehicleIdByTarga.get(r.originalPlateRef);
    if (!originalVehicleId) { skippedNoOriginal++; continue; }
    const substituteVehicleId = vehicleIdByTarga.get(r.targa) ?? null;
    const dataIngresso = r.contrattoDataInizio ?? new Date().toISOString().slice(0, 10);
    const key = `${originalVehicleId}|${dataIngresso}`;
    if (seenCaseKey.has(key)) { skippedDup++; continue; }
    seenCaseKey.add(key);
    await sql.query(
      `INSERT INTO "ReplacementCase"
        (id, "vehicleId", motivo, "dataIngressoOfficina", "centroConvenzionato", "replacementVehicleId", stato, note, "createdAt", "updatedAt")
       VALUES ($1,$2,'GUASTO',$3,$4,$5,'APERTA',$6,now(),now())`,
      [crypto.randomUUID(), originalVehicleId, dataIngresso, r.leasingCompany ?? "N/D", substituteVehicleId,
       `Importato da dati reali — sostitutivo ${r.targa}. Motivo effettivo da verificare (non presente nella fonte).`]
    );
    casesCreated++;
  }
  console.log(`Pratiche create: ${casesCreated} (${skippedNoOriginal} senza originale, ${skippedDup} duplicati)`);

  const [{ count: nStazioni }] = await sql.query(`SELECT count(*) FROM "Station"`);
  const [{ count: nVeicoli }] = await sql.query(`SELECT count(*) FROM "Vehicle"`);
  const [{ count: nPratiche }] = await sql.query(`SELECT count(*) FROM "ReplacementCase"`);
  const [{ count: nUtenti }] = await sql.query(`SELECT count(*) FROM "User"`);
  console.log("\n== Riepilogo finale ==", { nStazioni, nVeicoli, nPratiche, nUtenti });
}

main().catch((e) => { console.error(e); process.exit(1); });
