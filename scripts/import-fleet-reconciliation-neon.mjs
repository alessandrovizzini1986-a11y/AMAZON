/**
 * Variante Neon di scripts/import-fleet-reconciliation.ts — stessa logica
 * (dismissioni/riattivazioni/inserimenti da Attivi, veicoli storici +
 * arricchimento + storico stazioni da Cessati), SQL parametrizzato via
 * @neondatabase/serverless invece di Prisma.
 *
 * Uso: node scripts/import-fleet-reconciliation-neon.mjs --env-file .env --file /path/Lista_Targhe.xlsx
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

const STATION_CODES = ["DER1", "DER2", "DLO2", "DLO4", "DLO5", "DLZ2", "DVN1", "GLS"];
function extractStationCode(raw) {
  const s = String(raw ?? "").trim().toUpperCase();
  const code = s.split(/\s*-\s*/)[0];
  return code && STATION_CODES.includes(code) ? code : null;
}

const BRAND_FIX = {
  PEOUGET: "Peugeot", PEUGEUT: "Peugeot", PEUGEOT: "Peugeot", PEUGET: "Peugeot",
  VOLSWAGEN: "Volkswagen", VOLKSWAGEN: "Volkswagen", WOLSVAGEN: "Volkswagen",
  IVECO: "Iveco", FORD: "Ford", FIAT: "Fiat", OPEL: "Opel",
  RENAULT: "Renault", CITROEN: "Citroen", TOYOTA: "Toyota",
  MAXUS: "Maxus", RAP: "Rap",
};
function fixBrand(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "N/D";
  const key = s.toUpperCase();
  return BRAND_FIX[key] ?? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const COMPANY_FIX = {
  HERZ: "Hertz", HERTZ: "Hertz",
  EUROPCAR: "Europcar",
  AVIS: "Avis",
  ARVAL: "Arval", "ARVAL FINE NOLEGGIO": "Arval", "ARVAL BT": "Arval",
  NOLEGGIARE: "Noleggiare", AUTOVIA: "Autovia", LOCAUTO: "Locauto",
  SIXT: "Sixt", MAGGIORE: "Maggiore", LEASEPLAN: "LeasePlan",
  DRIVALIA: "Drivalia", LEASYS: "Leasys",
  TORENTAL: "Torental", VEM: "Vem",
};
function fixCompany(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const key = s.toUpperCase();
  if (COMPANY_FIX[key]) return COMPANY_FIX[key];
  if (key === "ALD" || key === "ALD MT") return key;
  return s;
}

const TIPO_MAP = {
  MT: "MT", "NOLEGGIO MEDIO TERMINE": "MT",
  LT: "LT", "NOLEGGIO LUNGO TERMINE": "LT",
  BT: "BT", "B.T": "BT", "NOLEGGIO BREVE TERMINE": "BT",
  SOST: "SOST",
  UFFICIO: "UFFICIO",
};
function mapTipo(raw) {
  const s = String(raw ?? "").trim().toUpperCase();
  return TIPO_MAP[s] ?? null;
}

function parseItalianDecimal(raw) {
  const s = String(raw ?? "").trim();
  if (!s || s === "-") return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function asDate(v) {
  return v instanceof Date ? v.toISOString().slice(0, 10) : null;
}

/** vedi commento in import-fleet-reconciliation.ts: la colonna "Note" del
 * foglio Cessati è quasi sempre una formula Excel residua (oggetto
 * {formula,result}), non testo — qui si tiene solo la stringa reale. */
function cellNote(v) {
  if (typeof v === "string") return v.trim() || null;
  return null;
}

const PLATE_RE = /^[A-Z0-9]{5,8}$/;
function extractPlateRef(note) {
  const first = note.trim().split(/[\s,\-–]/)[0]?.toUpperCase();
  return first && PLATE_RE.test(first) && /\d/.test(first) ? first : null;
}

function readAttivi(ws) {
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const targa = String(row.getCell(1).value ?? "").trim().toUpperCase();
    const dsRaw = row.getCell(2).value;
    if (!targa || !dsRaw) return;
    rows.push({
      targa,
      dsCode: extractStationCode(dsRaw),
      marca: fixBrand(row.getCell(3).value),
      modello: String(row.getCell(4).value ?? "").trim(),
      statoRaw: String(row.getCell(5).value ?? "").trim().toUpperCase(),
      societa: fixCompany(row.getCell(6).value),
      tipo: mapTipo(row.getCell(7).value),
      ra: String(row.getCell(8).value ?? "").trim() || null,
      dataInizio: asDate(row.getCell(9).value),
      dataFine: asDate(row.getCell(10).value),
      note: cellNote(row.getCell(11).value),
      tariffa: parseItalianDecimal(row.getCell(12).value),
    });
  });
  return rows;
}

function readCessati(ws) {
  const events = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const targa = String(row.getCell(1).value ?? "").trim().toUpperCase();
    const dataInizio = asDate(row.getCell(9).value);
    if (!targa || !dataInizio) return;
    events.push({
      targa,
      dsCode: extractStationCode(row.getCell(2).value),
      marca: fixBrand(row.getCell(3).value),
      modello: String(row.getCell(4).value ?? "").trim(),
      societa: fixCompany(row.getCell(6).value),
      tipo: mapTipo(row.getCell(7).value),
      ra: String(row.getCell(8).value ?? "").trim() || null,
      dataInizio,
      dataFine: asDate(row.getCell(10).value),
      note: cellNote(row.getCell(11).value),
    });
  });
  return events;
}

function dedupeCessati(events) {
  const seen = new Set();
  const out = [];
  for (const e of events) {
    const key = `${e.targa}|${e.dsCode}|${e.dataInizio}|${e.dataFine ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

async function main() {
  const filePath = arg("file");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const attiviRows = readAttivi(wb.getWorksheet("Attivi"));
  const attiviByTarga = new Map(attiviRows.map((r) => [r.targa, r]));
  console.log(`Attivi: ${attiviRows.length} targhe reali lette`);

  const cessatiRaw = readCessati(wb.getWorksheet("Cessati"));
  const cessati = dedupeCessati(cessatiRaw);
  console.log(`Cessati: ${cessatiRaw.length} righe lette, ${cessatiRaw.length - cessati.length} duplicati esatti scartati, ${cessati.length} eventi validi`);

  const cessatiByTarga = new Map();
  for (const e of cessati) {
    const list = cessatiByTarga.get(e.targa) ?? [];
    list.push(e);
    cessatiByTarga.set(e.targa, list);
  }
  for (const list of cessatiByTarga.values()) list.sort((a, b) => a.dataInizio.localeCompare(b.dataInizio));
  console.log(`Cessati: ${cessatiByTarga.size} targhe uniche`);

  const stationRows = await sql.query(`SELECT id, code FROM "Station"`);
  const stationIdByCode = new Map(stationRows.map((s) => [s.code, s.id]));

  const dbVehicleRows = await sql.query(`SELECT id, targa, stato, modello FROM "Vehicle"`);
  const dbByTarga = new Map(dbVehicleRows.map((v) => [v.targa.toUpperCase(), v]));

  // ---------------------------------------------------------------
  // 1) ATTIVI: dismissioni + riattivazioni + inserimenti
  // ---------------------------------------------------------------
  const onlyInAttivi = [...attiviByTarga.keys()].filter((t) => !dbByTarga.has(t));
  const onlyInDbNonDismesso = dbVehicleRows.filter((v) => v.stato !== "DISMESSO" && !attiviByTarga.has(v.targa.toUpperCase()));

  console.log(`\n== Dismissioni (candidate: ${onlyInDbNonDismesso.length}) ==`);
  let dismesse = 0;
  const dismesseNonConfermate = [];
  for (const v of onlyInDbNonDismesso) {
    const targa = v.targa.toUpperCase();
    if (!cessatiByTarga.has(targa)) { dismesseNonConfermate.push(targa); continue; }
    await sql.query(`UPDATE "Vehicle" SET stato='DISMESSO', "updatedAt"=now() WHERE id=$1`, [v.id]);
    dismesse++;
  }
  console.log(`Marcati DISMESSO (confermati dal foglio Cessati): ${dismesse}`);
  if (dismesseNonConfermate.length) console.log(`NON dismessi (verificare manualmente):`, dismesseNonConfermate);

  console.log(`\n== Riattivazioni (targhe Attivi ma DISMESSO nel DB) ==`);
  let riattivate = 0;
  for (const [targa, r] of attiviByTarga) {
    const v = dbByTarga.get(targa);
    if (!v || v.stato !== "DISMESSO") continue;
    const stationId = r.dsCode ? stationIdByCode.get(r.dsCode) : undefined;
    const stato = r.statoRaw === "SOSTITUTIVO" ? "SOSTITUTIVO" : r.statoRaw === "UFFICIO" ? "UFFICIO" : "ATTIVO";
    await sql.query(
      `UPDATE "Vehicle" SET stato=$1, "stationId"=COALESCE($2,"stationId"), "leasingCompany"=$3,
        "contrattoLeasingNo"=$4, "tipoContratto"=$5, "contrattoDataInizio"=$6, "contrattoDataFine"=$7,
        note=$8, "updatedAt"=now()
       WHERE id=$9`,
      [stato, stationId ?? null, r.societa, r.ra, r.tipo, r.dataInizio, r.dataFine, r.note, v.id]
    );
    v.stato = stato;
    riattivate++;
  }
  console.log(`Veicoli riattivati: ${riattivate}`);

  console.log(`\n== Inserimenti nuovi veicoli attivi (${onlyInAttivi.length}) ==`);
  let inseriti = 0;
  const createdVehicleIdByTarga = new Map();
  const saltatiSenzaStazione = [];
  for (const targa of onlyInAttivi) {
    const r = attiviByTarga.get(targa);
    const stationId = r.dsCode ? stationIdByCode.get(r.dsCode) : undefined;
    if (!stationId) { saltatiSenzaStazione.push(targa); continue; }
    const stato = r.statoRaw === "SOSTITUTIVO" ? "SOSTITUTIVO" : r.statoRaw === "UFFICIO" ? "UFFICIO" : "ATTIVO";
    const id = crypto.randomUUID();
    await sql.query(
      `INSERT INTO "Vehicle"
        (id, targa, modello, alimentazione, "stationId", stato, "leasingCompany", "contrattoLeasingNo",
         "tipoContratto", "contrattoDataInizio", "canoneMese", note, "kmAttuali", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,'DIESEL',$4,$5,$6,$7,$8,$9,$10,$11,0,now(),now())`,
      [id, targa, `${r.marca} ${r.modello}`.trim(), stationId, stato, r.societa, r.ra, r.tipo, r.dataInizio, r.tariffa, r.note]
    );
    await sql.query(
      `INSERT INTO "VehicleStationHistory" (id, "vehicleId", "stationId", "fromDate", note)
       VALUES ($1,$2,$3,$4,'import ricognizione flotta')`,
      [crypto.randomUUID(), id, stationId, r.dataInizio ?? new Date().toISOString().slice(0, 10)]
    );
    createdVehicleIdByTarga.set(targa, id);
    dbByTarga.set(targa, { id, targa, stato, modello: `${r.marca} ${r.modello}`.trim() });
    inseriti++;
  }
  console.log(`Veicoli creati: ${inseriti}`);
  if (saltatiSenzaStazione.length) console.log(`Saltati (stazione non riconosciuta):`, saltatiSenzaStazione);

  console.log(`\n== Pratiche sostitutivo da inserimenti (nota con targa originale) ==`);
  let casiCreati = 0, casiSaltatiOriginaleNonInFlotta = 0;
  for (const targa of onlyInAttivi) {
    const r = attiviByTarga.get(targa);
    if (r.statoRaw !== "SOSTITUTIVO" || !r.note) continue;
    const originalPlate = extractPlateRef(r.note);
    if (!originalPlate) continue;
    const originalVehicle = dbByTarga.get(originalPlate);
    if (!originalVehicle) { casiSaltatiOriginaleNonInFlotta++; continue; }
    const substituteId = createdVehicleIdByTarga.get(targa) ?? null;
    const dataIngresso = r.dataInizio ?? new Date().toISOString().slice(0, 10);
    const existing = await sql.query(
      `SELECT id FROM "ReplacementCase" WHERE "vehicleId"=$1 AND "dataIngressoOfficina"=$2`,
      [originalVehicle.id, dataIngresso]
    );
    if (existing.length) continue;
    await sql.query(
      `INSERT INTO "ReplacementCase"
        (id, "vehicleId", motivo, "dataIngressoOfficina", "centroConvenzionato", "replacementVehicleId", stato, note, "createdAt", "updatedAt")
       VALUES ($1,$2,'GUASTO',$3,$4,$5,'APERTA',$6,now(),now())`,
      [crypto.randomUUID(), originalVehicle.id, dataIngresso, r.societa ?? "N/D", substituteId,
       `Importato da ricognizione flotta — sostitutivo ${targa}. Motivo effettivo da verificare (non presente nella fonte).`]
    );
    casiCreati++;
  }
  console.log(`Pratiche sostitutivo create: ${casiCreati} (${casiSaltatiOriginaleNonInFlotta} scartate: targa originale non in flotta)`);

  // ---------------------------------------------------------------
  // 2) CESSATI: veicoli storici + arricchimento + storico stazioni
  // ---------------------------------------------------------------
  console.log(`\n== Cessati: veicoli storici e storico stazioni ==`);
  let veicoliStoriciCreati = 0, arricchiti = 0, historyCreate = 0;
  const senzaStazione = [];
  for (const [targa, events] of cessatiByTarga) {
    let vehicle = dbByTarga.get(targa);
    const latest = events[events.length - 1];
    if (!vehicle) {
      const stationId = latest.dsCode ? stationIdByCode.get(latest.dsCode) : undefined;
      if (!stationId) { senzaStazione.push(targa); continue; }
      const id = crypto.randomUUID();
      await sql.query(
        `INSERT INTO "Vehicle"
          (id, targa, modello, alimentazione, "stationId", stato, "leasingCompany", "contrattoLeasingNo",
           "tipoContratto", "contrattoDataInizio", "contrattoDataFine", note, "kmAttuali", "createdAt", "updatedAt")
         VALUES ($1,$2,$3,'DIESEL',$4,'DISMESSO',$5,$6,$7,$8,$9,'Veicolo storico — da ricognizione flotta (foglio Cessati)',0,now(),now())`,
        [id, targa, `${latest.marca} ${latest.modello}`.trim(), stationId, latest.societa, latest.ra, latest.tipo, latest.dataInizio, latest.dataFine]
      );
      vehicle = { id, targa, stato: "DISMESSO", modello: `${latest.marca} ${latest.modello}`.trim() };
      dbByTarga.set(targa, vehicle);
      veicoliStoriciCreati++;
    } else if (vehicle.modello?.startsWith("Veicolo storico (dati non disponibili")) {
      const stationId = latest.dsCode ? stationIdByCode.get(latest.dsCode) : undefined;
      await sql.query(
        `UPDATE "Vehicle" SET modello=$1, "leasingCompany"=$2, "contrattoLeasingNo"=$3, "tipoContratto"=$4,
          "contrattoDataInizio"=$5, "contrattoDataFine"=$6, "stationId"=COALESCE($7,"stationId"), "updatedAt"=now()
         WHERE id=$8`,
        [`${latest.marca} ${latest.modello}`.trim(), latest.societa, latest.ra, latest.tipo, latest.dataInizio, latest.dataFine, stationId ?? null, vehicle.id]
      );
      arricchiti++;
    }

    for (const e of events) {
      const stationId = e.dsCode ? stationIdByCode.get(e.dsCode) : undefined;
      if (!stationId) continue;
      const dup = await sql.query(
        `SELECT id FROM "VehicleStationHistory" WHERE "vehicleId"=$1 AND "stationId"=$2 AND "fromDate"=$3`,
        [vehicle.id, stationId, e.dataInizio]
      );
      if (dup.length) continue;
      await sql.query(
        `INSERT INTO "VehicleStationHistory" (id, "vehicleId", "stationId", "fromDate", "toDate", note)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [crypto.randomUUID(), vehicle.id, stationId, e.dataInizio, e.dataFine, e.note]
      );
      historyCreate++;
    }
  }
  console.log(`Veicoli storici creati: ${veicoliStoriciCreati}`);
  console.log(`Veicoli placeholder arricchiti con dati reali: ${arricchiti}`);
  console.log(`Righe storico stazioni create: ${historyCreate}`);
  if (senzaStazione.length) console.log(`Targhe Cessati senza stazione riconoscibile (nessun veicolo creato):`, senzaStazione);

  console.log("\n== Riepilogo finale ==");
  const [{ count: veicoli }] = await sql.query(`SELECT count(*) FROM "Vehicle"`);
  const [{ count: attivi }] = await sql.query(`SELECT count(*) FROM "Vehicle" WHERE stato='ATTIVO'`);
  const [{ count: sostitutivi }] = await sql.query(`SELECT count(*) FROM "Vehicle" WHERE stato='SOSTITUTIVO'`);
  const [{ count: dismessi }] = await sql.query(`SELECT count(*) FROM "Vehicle" WHERE stato='DISMESSO'`);
  const [{ count: storicoRighe }] = await sql.query(`SELECT count(*) FROM "VehicleStationHistory"`);
  console.log({ veicoli, attivi, sostitutivi, dismessi, storicoRighe });
}

main().catch((e) => { console.error(e); process.exit(1); });
