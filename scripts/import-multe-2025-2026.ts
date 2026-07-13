/**
 * Import una tantum delle multe 2025 e 2026 da export interno (fogli "2025"
 * e "2026" del workbook Multe.xlsx — gli altri fogli sono pivot/analisi
 * derivate o il solo 2024, non richiesto in questa consegna).
 *
 * Uso: npx tsx scripts/import-multe-2025-2026.ts --file /path/Multe.xlsx
 *
 * Mappatura verso il modello Fine:
 *  - vehicleId: match per Targa sul nostro DB (non solo Ayvens/ALD, tutta la flotta)
 *  - verbaleNo = Verbale (anche chiave anti-duplicato)
 *  - dataOraInfrazione = Data infrazione (+ Ora infrazione se presente)
 *  - luogo = "Via, Città"
 *  - tipoViolazione = Motivo della multa (fallback: Motivo normalizzato)
 *  - importo = Importo
 *  - stato = NOTIFICATA (la fonte ha sempre una Data notifica multa: sono
 *    multe già notificate, non abbiamo un segnale esplicito "pagata")
 *  - dataNotifica = Data notifica multa
 *  - riaddebito = ADDEBITATO se "Metodo di pagamento" contiene "TRATTENUTA IN
 *    BUSTA", NON_PREVISTO se "COSTO AZIENDALE" (tutto il costo sull'appalto)
 *  - importoRiaddebito = importo se riaddebito=ADDEBITATO, altrimenti null
 *  - driverId resta null: nel nostro DB non esiste ancora nessun account
 *    Driver (0 al momento dell'import) — il nominativo dalla fonte viene
 *    comunque preservato in assegnazioneFonte per non perdere l'informazione
 *  - puntiPatente resta 0: la fonte ha solo un flag SI/NO se la violazione
 *    comporta punti, non il numero esatto — non fabbrichiamo un valore
 */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`Argomento mancante: --${name}`);
  return process.argv[i + 1];
}

/** Alcune celle sono formule con risultato cache (XLOOKUP ecc.) invece di valori piatti. */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v !== null) {
    const obj = v as { result?: unknown; richText?: { text: string }[] };
    if (obj.richText) return obj.richText.map((r) => r.text).join("");
    if ("result" in obj) return String(obj.result ?? "");
    return "";
  }
  return String(v).trim();
}

function excelTimeOfDay(v: unknown): { h: number; m: number } | null {
  if (!(v instanceof Date)) return null;
  return { h: v.getUTCHours(), m: v.getUTCMinutes() };
}

type FineRow = {
  anno: number; targa: string; verbale: string; driver: string; tipoContratto: string;
  dataInfrazione: Date | null; dataNotifica: Date | null;
  metodoPagamento: string; punti: string; importo: number | null;
  motivoMulta: string; motivoNormalizzato: string; citta: string; via: string;
  stationRaw: string;
};

function parseSheet(ws: ExcelJS.Worksheet, anno: number): { rows: FineRow[]; puntiAnomalie: unknown[] } {
  const rows: FineRow[] = [];
  const puntiAnomalie: unknown[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const targa = cellText(row.getCell(10).value).toUpperCase();
    if (!targa) return;
    const dataInfrazioneRaw = row.getCell(4).value;
    const dataInfrazione = dataInfrazioneRaw instanceof Date ? dataInfrazioneRaw : null;
    const ora = excelTimeOfDay(row.getCell(5).value);
    if (dataInfrazione && ora) {
      dataInfrazione.setUTCHours(ora.h, ora.m, 0, 0);
    }
    const dataNotificaRaw = row.getCell(6).value;
    const puntiVal = row.getCell(15).value;
    const puntiStr = cellText(puntiVal);
    if (puntiStr !== "SI" && puntiStr !== "NO" && puntiStr !== "") {
      puntiAnomalie.push({ anno, verbale: cellText(row.getCell(9).value), targa, puntiVal });
    }
    const importoVal = row.getCell(16).value;
    rows.push({
      anno,
      targa,
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

/** Colonna "Station" (es. "DLZ2 - POMEZIA") -> codice stazione, se riconoscibile. */
function extractStationCode(raw: string): string | null {
  const code = raw.trim().split(/\s*-\s*/)[0]?.toUpperCase();
  return code && STATION_CODES.includes(code) ? code : null;
}

async function main() {
  const filePath = arg("file");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const y2025 = parseSheet(wb.getWorksheet("2025")!, 2025);
  const y2026 = parseSheet(wb.getWorksheet("2026")!, 2026);
  const allRows = [...y2025.rows, ...y2026.rows];
  const puntiAnomalie = [...y2025.puntiAnomalie, ...y2026.puntiAnomalie];
  console.log(`Righe lette: 2025=${y2025.rows.length}, 2026=${y2026.rows.length}, totale=${allRows.length}`);
  if (puntiAnomalie.length) console.log("Anomalie colonna 'punti' (non SI/NO):", JSON.stringify(puntiAnomalie));

  const vehicles = await prisma.vehicle.findMany({ select: { id: true, targa: true } });
  const byTarga = new Map(vehicles.map((v) => [v.targa.toUpperCase(), v]));

  // ---- veicoli storici per targhe non più in flotta (decisione utente: crearli come DISMESSO) ----
  const stations = await prisma.station.findMany({ select: { id: true, code: true } });
  const stationIdByCode = new Map(stations.map((s) => [s.code, s.id]));
  const stationVotesByTarga = new Map<string, Map<string, number>>();
  // per-targa: conta i codici stazione validi visti tra tutte le sue righe
  for (const r of allRows) {
    if (!byTarga.has(r.targa)) {
      const code = extractStationCode(r.stationRaw);
      if (code) {
        const votes = stationVotesByTarga.get(r.targa) ?? new Map<string, number>();
        votes.set(code, (votes.get(code) ?? 0) + 1);
        stationVotesByTarga.set(r.targa, votes);
      }
    }
  }
  const missingTarghe = [...new Set(allRows.map((r) => r.targa).filter((t) => !byTarga.has(t)))];
  let veicoliStoriciCreati = 0;
  const senzaStazioneRiconoscibile: string[] = [];
  for (const targa of missingTarghe) {
    const votes = stationVotesByTarga.get(targa);
    const bestCode = votes ? [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
    const stationId = bestCode ? stationIdByCode.get(bestCode) : undefined;
    if (!stationId) { senzaStazioneRiconoscibile.push(targa); continue; }
    const created = await prisma.vehicle.create({
      data: {
        targa,
        modello: "Veicolo storico (dati non disponibili — solo da import multe)",
        alimentazione: "DIESEL",
        stationId,
        stato: "DISMESSO",
        kmAttuali: 0,
      },
    });
    byTarga.set(targa, created);
    veicoliStoriciCreati++;
  }
  console.log(`Veicoli storici creati (targhe non in flotta attuale): ${veicoliStoriciCreati}`);
  if (senzaStazioneRiconoscibile.length) {
    console.log(`Targhe senza stazione riconoscibile in nessuna riga (non create, multe scartate):`, senzaStazioneRiconoscibile);
  }

  const existing = await prisma.fine.findMany({ select: { verbaleNo: true } });
  const seenVerbali = new Set(existing.map((f) => f.verbaleNo).filter(Boolean));

  let created = 0, skippedNotInDb = 0, skippedDuplicate = 0, skippedNoDate = 0, skippedNoImporto = 0;
  const notInDb = new Set<string>();
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

    await prisma.fine.create({
      data: {
        vehicleId: v.id,
        verbaleNo: r.verbale || null,
        dataOraInfrazione: r.dataInfrazione,
        luogo,
        tipoViolazione,
        importo: r.importo,
        stato: "NOTIFICATA",
        dataNotifica: r.dataNotifica,
        driverId: null,
        assegnazioneFonte,
        riaddebito,
        importoRiaddebito: riaddebito === "ADDEBITATO" ? r.importo : null,
      },
    });
    created++;
  }

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  await prisma.auditLog.create({
    data: {
      userId: admin?.id ?? null,
      action: "import.multe.2025_2026",
      entity: "Fine",
      meta: { created, skippedNotInDb, skippedDuplicate, skippedNoDate, skippedNoImporto, targheNonInDb: [...notInDb], puntiAnomalie },
    },
  });

  console.log("\n== Riepilogo ==");
  console.log(`Fine creati: ${created}`);
  console.log(`Saltati (targa non in DB): ${skippedNotInDb} (${notInDb.size} targhe uniche)`, [...notInDb].slice(0, 30));
  console.log(`Saltati (duplicati su verbale): ${skippedDuplicate}`);
  console.log(`Saltati (senza data infrazione valida): ${skippedNoDate}`);
  console.log(`Saltati (senza importo valido): ${skippedNoImporto}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
