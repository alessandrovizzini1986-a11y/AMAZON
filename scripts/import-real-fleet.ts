/**
 * Import una tantum della flotta reale (targhe, DS, canoni, franchigie,
 * contratti) fornita dall'operatore, in sostituzione dei dati demo.
 *
 * Uso:
 *   npx tsx scripts/import-real-fleet.ts --file /path/to/fleet.tsv
 *
 * Comportamento:
 *  - azzera stazioni/veicoli/dati transazionali demo (tagliandi, multe,
 *    movimentazioni, sostitutivi, danni, fuel, pedaggi) — restano solo
 *    l'utente Admin e la configurazione (AppConfig)
 *  - crea le stazioni reali dedotte dalla colonna "Nuova DS"
 *  - crea un veicolo per riga con: targa, marca+modello, stazione, stato,
 *    società noleggio, tipo contratto, N° RA, date contratto, canone
 *    mensile, franchigia danni, note
 *  - per le righe "Sostitutivo" con un riferimento a targa originale
 *    riconoscibile nella colonna Note, crea anche una ReplacementCase
 *    (stato APERTA, nessuno storno calcolato: dato non fornito)
 */
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// ---------- parsing utilità ----------

function parseItalianDecimal(raw: string): number | null {
  const s = raw.trim();
  if (!s || s === "-") return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** gg/mm/aaaa oppure, per un piccolo blocco finale del file, m/d/aaaa (rilevato da secondo numero > 12). */
function parseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/);
  if (!m) return null;
  const [, a, b, y] = m.map(Number) as unknown as [string, number, number, number];
  // se il secondo numero > 12 non può essere un mese -> è m/d (formato USA)
  if (b > 12) return new Date(y, a - 1, b);
  return new Date(y, b - 1, a);
}

const PLATE_RE = /^[A-Z0-9]{5,8}$/;

/** Estrae un riferimento a targa "pulito" da un testo (per collegare Sostitutivo -> veicolo originale). */
function extractPlateRef(note: string): string | null {
  const first = note.trim().split(/[\s,\-–]/)[0]?.toUpperCase();
  if (first && PLATE_RE.test(first) && /\d/.test(first)) return first;
  return null;
}

const BRAND_FIX: Record<string, string> = {
  PEOUGET: "Peugeot", PEUGEUT: "Peugeot", PEUGEOT: "Peugeot",
  VOLSWAGEN: "Volkswagen", VOLKSWAGEN: "Volkswagen",
  IVECO: "Iveco", FORD: "Ford", FIAT: "Fiat", OPEL: "Opel",
  RENAULT: "Renault", CITROEN: "Citroen", TOYOTA: "Toyota",
  MAXUS: "Maxus", RAP: "Rap",
};
function fixBrand(raw: string): string {
  const key = raw.trim().toUpperCase();
  return BRAND_FIX[key] ?? (raw.trim().charAt(0).toUpperCase() + raw.trim().slice(1).toLowerCase());
}

const COMPANY_FIX: Record<string, string> = {
  HERZ: "Hertz", HERTZ: "Hertz",
  EUROPCAR: "Europcar",
  AVIS: "Avis", ARVAL: "Arval", NOLEGGIARE: "Noleggiare",
  TORENTAL: "Torental", VEM: "Vem",
};
function fixCompany(raw: string): string {
  const key = raw.trim().toUpperCase();
  if (COMPANY_FIX[key]) return COMPANY_FIX[key];
  return raw.trim(); // "ALD", "ALD MT" mantenute verbatim (canali commerciali distinti)
}

const STATO_MAP: Record<string, "ATTIVO" | "SOSTITUTIVO" | "UFFICIO"> = {
  ATTIVO: "ATTIVO",
  SOSTITUTIVO: "SOSTITUTIVO",
  UFFICIO: "UFFICIO",
};

const TIPO_MAP: Record<string, "MT" | "LT" | "BT" | "SOST" | "UFFICIO"> = {
  MT: "MT", LT: "LT", BT: "BT", SOST: "SOST", UFFICIO: "UFFICIO",
};

type ParsedRow = {
  targa: string;
  stationCode: string;
  stationName: string;
  marca: string;
  modello: string;
  stato: "ATTIVO" | "SOSTITUTIVO" | "UFFICIO";
  leasingCompany: string | null;
  tipoContratto: "MT" | "LT" | "BT" | "SOST" | "UFFICIO" | null;
  contrattoLeasingNo: string | null;
  contrattoDataInizio: Date | null;
  contrattoDataFine: Date | null;
  note: string | null;
  canoneMese: number | null;
  franchigiaDanni: number | null;
  isElettrico: boolean;
  originalPlateRef: string | null; // per SOST: targa veicolo originale, se riconoscibile
};

function parseTsv(filePath: string): ParsedRow[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const [, ...dataLines] = lines; // salta intestazione
  const rows: ParsedRow[] = [];

  for (const line of dataLines) {
    const cols = line.split("\t");
    const [
      targaRaw, dsRaw, marcaRaw, modelloRaw, statoRaw, societaRaw, tipoRaw,
      raRaw, dataInizioRaw, dataFineRaw, noteRaw, tariffaRaw, ,
      frDanniRaw,
    ] = cols;

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
      targa,
      stationCode,
      stationName,
      marca: fixBrand(marcaRaw ?? ""),
      modello: (modelloRaw ?? "").trim(),
      stato,
      leasingCompany: societaRaw ? fixCompany(societaRaw) : null,
      tipoContratto: TIPO_MAP[(tipoRaw ?? "").trim().toUpperCase()] ?? null,
      contrattoLeasingNo: (raRaw ?? "").trim() || null,
      contrattoDataInizio: parseDate(dataInizioRaw ?? ""),
      contrattoDataFine: parseDate(dataFineRaw ?? ""),
      note,
      canoneMese: parseItalianDecimal(tariffaRaw ?? ""),
      franchigiaDanni: parseItalianDecimal(frDanniRaw ?? ""),
      isElettrico,
      originalPlateRef: stato === "SOSTITUTIVO" && note ? extractPlateRef(note) : null,
    });
  }
  return rows;
}

// ---------- main ----------

async function main() {
  const fileArgIdx = process.argv.indexOf("--file");
  const filePath = fileArgIdx >= 0 ? process.argv[fileArgIdx + 1] : null;
  if (!filePath) throw new Error("Uso: npx tsx scripts/import-real-fleet.ts --file <path.tsv>");

  const rows = parseTsv(filePath);
  console.log(`Righe lette: ${rows.length}`);

  // dedup targhe (mantiene la prima occorrenza — nel file reale può capitare
  // che la stessa targa compaia due volte per storicità del foglio)
  const seen = new Set<string>();
  const uniqueRows: ParsedRow[] = [];
  let duplicati = 0;
  for (const r of rows) {
    if (seen.has(r.targa)) { duplicati++; continue; }
    seen.add(r.targa);
    uniqueRows.push(r);
  }
  console.log(`Targhe uniche: ${uniqueRows.length} (${duplicati} duplicate scartate, prima occorrenza mantenuta)`);

  console.log("\n== Pulizia dati demo (mantiene Admin e AppConfig) ==");
  await db.auditLog.deleteMany();
  await db.importJob.deleteMany();
  await db.fuelTransaction.deleteMany();
  await db.tollTransaction.deleteMany();
  await db.fuelCard.deleteMany();
  await db.damage.deleteMany();
  await db.replacementCase.deleteMany();
  await db.stationTransfer.deleteMany();
  await db.assignment.deleteMany();
  await db.fine.deleteMany();
  await db.serviceRecord.deleteMany();
  await db.vehicleStationHistory.deleteMany();
  await db.vehicle.deleteMany();
  await db.user.deleteMany({ where: { role: { not: "ADMIN" } } });
  await db.station.deleteMany();
  console.log("Dati demo rimossi.");

  console.log("\n== Stazioni reali ==");
  const stationCodes = [...new Set(uniqueRows.map((r) => r.stationCode))].sort();
  const stationByCode = new Map<string, string>();
  for (const code of stationCodes) {
    const name = uniqueRows.find((r) => r.stationCode === code)!.stationName;
    const st = await db.station.create({ data: { code, name } });
    stationByCode.set(code, st.id);
    console.log(`  ${code} — ${name}`);
  }

  console.log("\n== Veicoli ==");
  const vehicleIdByTarga = new Map<string, string>();
  let created = 0;
  for (const r of uniqueRows) {
    const stationId = stationByCode.get(r.stationCode);
    if (!stationId) { console.log(`  SALTATO ${r.targa}: stazione ${r.stationCode} non risolta`); continue; }
    const v = await db.vehicle.create({
      data: {
        targa: r.targa,
        modello: `${r.marca} ${r.modello}`.trim(),
        alimentazione: r.isElettrico ? "ELETTRICO" : "DIESEL",
        stationId,
        stato: r.stato,
        canoneMese: r.canoneMese,
        franchigiaDanni: r.franchigiaDanni,
        leasingCompany: r.leasingCompany,
        contrattoLeasingNo: r.contrattoLeasingNo,
        tipoContratto: r.tipoContratto,
        contrattoDataInizio: r.contrattoDataInizio,
        contrattoDataFine: r.contrattoDataFine,
        note: r.note,
        stationHistory: { create: { stationId, fromDate: new Date(), note: "import flotta reale" } },
      },
    });
    vehicleIdByTarga.set(r.targa, v.id);
    created++;
  }
  console.log(`Veicoli creati: ${created}`);

  console.log("\n== Pratiche sostitutivo (da righe Sostitutivo con targa originale riconoscibile) ==");
  let casesCreated = 0;
  let casesSkippedNoOriginal = 0;
  let casesSkippedDup = 0;
  const seenCaseKey = new Set<string>();
  for (const r of uniqueRows) {
    if (r.stato !== "SOSTITUTIVO" || !r.originalPlateRef) continue;
    const originalVehicleId = vehicleIdByTarga.get(r.originalPlateRef);
    if (!originalVehicleId) { casesSkippedNoOriginal++; continue; }
    const substituteVehicleId = vehicleIdByTarga.get(r.targa) ?? null;
    const dataIngresso = r.contrattoDataInizio ?? new Date();
    const key = `${originalVehicleId}|${dataIngresso.toISOString().slice(0, 10)}`;
    if (seenCaseKey.has(key)) { casesSkippedDup++; continue; } // vincolo anti doppio-storno
    seenCaseKey.add(key);
    await db.replacementCase.create({
      data: {
        vehicleId: originalVehicleId,
        motivo: "GUASTO", // motivo non specificato nella fonte: default, correggibile manualmente
        dataIngressoOfficina: dataIngresso,
        centroConvenzionato: r.leasingCompany ?? "N/D",
        replacementVehicleId: substituteVehicleId,
        stato: "APERTA",
        note: `Importato da dati reali — sostitutivo ${r.targa}. Motivo effettivo da verificare (non presente nella fonte).`,
      },
    });
    casesCreated++;
  }
  console.log(`Pratiche create: ${casesCreated} (${casesSkippedNoOriginal} scartate: targa originale non in flotta, ${casesSkippedDup} scartate: duplicato targa+data)`);

  const counts = {
    stazioni: await db.station.count(),
    veicoli: await db.vehicle.count(),
    pratiche: await db.replacementCase.count(),
    utenti: await db.user.count(),
  };
  console.log("\n== Riepilogo finale ==");
  console.log(counts);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
