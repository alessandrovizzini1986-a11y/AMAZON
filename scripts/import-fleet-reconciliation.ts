/**
 * Import una tantum di ricognizione flotta ("Lista Targhe per il fleet",
 * fogli Attivi + Cessati) forniti dall'operatore, per riconciliare il parco
 * veicoli con la situazione reale:
 *
 *  - Attivi: targhe presenti solo qui (non ancora in flotta) vengono create
 *    come nuovo veicolo; targhe presenti nel gestionale come non-dismesse ma
 *    assenti da questo foglio E confermate cessate nel foglio Cessati
 *    vengono marcate DISMESSO (se non confermate da Cessati, non si tocca:
 *    segnalate per verifica manuale)
 *  - Cessati: log storico dei movimenti per ogni targa (anche per veicoli
 *    tornati attivi dopo una cessazione, es. rientro da noleggio breve
 *    termine — questi restano nello stato attuale, si aggiunge solo lo
 *    storico) — crea veicoli storici DISMESSO per le targhe mai viste
 *    prima, arricchisce con dati reali marca/modello i placeholder storici
 *    già creati da import-multe-2025-2026.ts (che avevano solo la targa),
 *    aggiunge un record VehicleStationHistory per ogni evento
 *
 * Uso:
 *   npx tsx scripts/import-fleet-reconciliation.ts --file /path/Lista_Targhe.xlsx
 */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`Argomento mancante: --${name}`);
  return process.argv[i + 1];
}

const STATION_CODES = ["DER1", "DER2", "DLO2", "DLO4", "DLO5", "DLZ2", "DVN1", "GLS"];
function extractStationCode(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toUpperCase();
  const code = s.split(/\s*-\s*/)[0];
  return code && STATION_CODES.includes(code) ? code : null;
}

const BRAND_FIX: Record<string, string> = {
  PEOUGET: "Peugeot", PEUGEUT: "Peugeot", PEUGEOT: "Peugeot", PEUGET: "Peugeot",
  VOLSWAGEN: "Volkswagen", VOLKSWAGEN: "Volkswagen", WOLSVAGEN: "Volkswagen",
  IVECO: "Iveco", FORD: "Ford", FIAT: "Fiat", OPEL: "Opel",
  RENAULT: "Renault", CITROEN: "Citroen", TOYOTA: "Toyota",
  MAXUS: "Maxus", RAP: "Rap",
};
function fixBrand(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "N/D";
  const key = s.toUpperCase();
  return BRAND_FIX[key] ?? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const COMPANY_FIX: Record<string, string> = {
  HERZ: "Hertz", HERTZ: "Hertz",
  EUROPCAR: "Europcar",
  AVIS: "Avis",
  ARVAL: "Arval", "ARVAL FINE NOLEGGIO": "Arval", "ARVAL BT": "Arval",
  NOLEGGIARE: "Noleggiare", AUTOVIA: "Autovia", LOCAUTO: "Locauto",
  SIXT: "Sixt", MAGGIORE: "Maggiore", LEASEPLAN: "LeasePlan",
  DRIVALIA: "Drivalia", LEASYS: "Leasys",
  TORENTAL: "Torental", VEM: "Vem",
};
function fixCompany(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const key = s.toUpperCase();
  if (COMPANY_FIX[key]) return COMPANY_FIX[key];
  if (key === "ALD" || key === "ALD MT") return key; // canali commerciali distinti, mantenuti verbatim
  return s;
}

const TIPO_MAP: Record<string, "MT" | "LT" | "BT" | "SOST" | "UFFICIO"> = {
  MT: "MT", "NOLEGGIO MEDIO TERMINE": "MT",
  LT: "LT", "NOLEGGIO LUNGO TERMINE": "LT",
  BT: "BT", "B.T": "BT", "NOLEGGIO BREVE TERMINE": "BT",
  SOST: "SOST",
  UFFICIO: "UFFICIO",
};
function mapTipo(raw: unknown): "MT" | "LT" | "BT" | "SOST" | "UFFICIO" | null {
  const s = String(raw ?? "").trim().toUpperCase();
  return TIPO_MAP[s] ?? null;
}

function parseItalianDecimal(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (!s || s === "-") return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function asDate(v: unknown): Date | null {
  return v instanceof Date ? v : null;
}

/**
 * La colonna "Note" del foglio Cessati è in realtà, nella maggior parte delle
 * righe, una formula Excel residua ("Data inizio - Data Fine", pensata per
 * calcolare una durata) che ExcelJS restituisce come oggetto {formula,result}
 * — non testo. Solo una minoranza di righe ha una nota libera scritta a
 * mano (stringa vera). Qui si tiene solo il testo reale, scartando in modo
 * esplicito l'artefatto della formula (senza il controllo esplicito
 * sull'oggetto, finirebbe stringificato come "[object Object]").
 */
function cellNote(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  return null;
}

const PLATE_RE = /^[A-Z0-9]{5,8}$/;
function extractPlateRef(note: string): string | null {
  const first = note.trim().split(/[\s,\-–]/)[0]?.toUpperCase();
  return first && PLATE_RE.test(first) && /\d/.test(first) ? first : null;
}

type AttiviRow = {
  targa: string; dsCode: string | null; marca: string; modello: string;
  statoRaw: string; societa: string | null; tipo: ReturnType<typeof mapTipo>;
  ra: string | null; dataInizio: Date | null; dataFine: Date | null;
  note: string | null; tariffa: number | null;
};

function readAttivi(ws: ExcelJS.Worksheet): AttiviRow[] {
  const rows: AttiviRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const targa = String(row.getCell(1).value ?? "").trim().toUpperCase();
    const dsRaw = row.getCell(2).value;
    if (!targa || !dsRaw) return; // scarta le righe "fantasma" solo-targa in fondo al foglio
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

type CessatoEvent = {
  targa: string; dsCode: string | null; marca: string; modello: string;
  societa: string | null; tipo: ReturnType<typeof mapTipo>; ra: string | null;
  dataInizio: Date; dataFine: Date | null; note: string | null;
};

function readCessati(ws: ExcelJS.Worksheet): CessatoEvent[] {
  const events: CessatoEvent[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const targa = String(row.getCell(1).value ?? "").trim().toUpperCase();
    const dataInizio = asDate(row.getCell(9).value);
    if (!targa || !dataInizio) return;
    const dataFine = asDate(row.getCell(10).value);
    events.push({
      targa,
      dsCode: extractStationCode(row.getCell(2).value),
      marca: fixBrand(row.getCell(3).value),
      modello: String(row.getCell(4).value ?? "").trim(),
      societa: fixCompany(row.getCell(6).value),
      tipo: mapTipo(row.getCell(7).value),
      ra: String(row.getCell(8).value ?? "").trim() || null,
      dataInizio,
      dataFine,
      note: cellNote(row.getCell(11).value),
    });
  });
  return events;
}

/** Scarta righe esattamente duplicate (stessa targa, stazione e date) — non unisce eventi storici diversi sulla stessa targa (es. stesso furgone rientrato più volte). */
function dedupeCessati(events: CessatoEvent[]): CessatoEvent[] {
  const seen = new Set<string>();
  const out: CessatoEvent[] = [];
  for (const e of events) {
    const key = `${e.targa}|${e.dsCode}|${e.dataInizio.toISOString()}|${e.dataFine?.toISOString() ?? ""}`;
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

  const attiviRows = readAttivi(wb.getWorksheet("Attivi")!);
  const attiviByTarga = new Map(attiviRows.map((r) => [r.targa, r]));
  console.log(`Attivi: ${attiviRows.length} targhe reali lette`);

  const cessatiRaw = readCessati(wb.getWorksheet("Cessati")!);
  const cessati = dedupeCessati(cessatiRaw);
  console.log(`Cessati: ${cessatiRaw.length} righe lette, ${cessatiRaw.length - cessati.length} duplicati esatti scartati (stessa targa/stazione/date), ${cessati.length} eventi validi`);

  const cessatiByTarga = new Map<string, CessatoEvent[]>();
  for (const e of cessati) {
    const list = cessatiByTarga.get(e.targa) ?? [];
    list.push(e);
    cessatiByTarga.set(e.targa, list);
  }
  for (const list of cessatiByTarga.values()) list.sort((a, b) => a.dataInizio.getTime() - b.dataInizio.getTime());
  console.log(`Cessati: ${cessatiByTarga.size} targhe uniche`);

  const stations = await prisma.station.findMany({ select: { id: true, code: true } });
  const stationIdByCode = new Map(stations.map((s) => [s.code, s.id]));

  const dbVehicles = await prisma.vehicle.findMany({ select: { id: true, targa: true, stato: true, modello: true } });
  const dbByTarga = new Map(dbVehicles.map((v) => [v.targa.toUpperCase(), v]));

  // ---------------------------------------------------------------
  // 1) ATTIVI: dismissioni + inserimenti
  // ---------------------------------------------------------------
  const onlyInAttivi = [...attiviByTarga.keys()].filter((t) => !dbByTarga.has(t));
  const onlyInDbNonDismesso = dbVehicles.filter((v) => v.stato !== "DISMESSO" && !attiviByTarga.has(v.targa.toUpperCase()));

  console.log(`\n== Dismissioni (candidate: ${onlyInDbNonDismesso.length}) ==`);
  let dismesse = 0;
  const dismesseNonConfermate: string[] = [];
  for (const v of onlyInDbNonDismesso) {
    const targa = v.targa.toUpperCase();
    if (!cessatiByTarga.has(targa)) { dismesseNonConfermate.push(targa); continue; }
    await prisma.vehicle.update({ where: { id: v.id }, data: { stato: "DISMESSO" } });
    dismesse++;
  }
  console.log(`Marcati DISMESSO (confermati dal foglio Cessati): ${dismesse}`);
  if (dismesseNonConfermate.length) {
    console.log(`NON dismessi (assenti da Attivi ma anche da Cessati — verificare manualmente):`, dismesseNonConfermate);
  }

  // targhe presenti in Attivi ma segnate DISMESSO nel DB (es. dismesse per
  // errore da un import precedente, o rientrate in flotta dopo una
  // cessazione): il foglio Attivi è la fonte di verità su "chi è attivo ora"
  console.log(`\n== Riattivazioni (targhe Attivi ma DISMESSO nel DB) ==`);
  let riattivate = 0;
  for (const [targa, r] of attiviByTarga) {
    const v = dbByTarga.get(targa);
    if (!v || v.stato !== "DISMESSO") continue;
    const stationId = r.dsCode ? stationIdByCode.get(r.dsCode) : undefined;
    const stato = r.statoRaw === "SOSTITUTIVO" ? "SOSTITUTIVO" : r.statoRaw === "UFFICIO" ? "UFFICIO" : "ATTIVO";
    await prisma.vehicle.update({
      where: { id: v.id },
      data: {
        stato,
        ...(stationId ? { stationId } : {}),
        leasingCompany: r.societa,
        contrattoLeasingNo: r.ra,
        tipoContratto: r.tipo,
        contrattoDataInizio: r.dataInizio,
        contrattoDataFine: r.dataFine,
        note: r.note,
      },
    });
    v.stato = stato;
    riattivate++;
  }
  console.log(`Veicoli riattivati: ${riattivate}`);

  console.log(`\n== Inserimenti nuovi veicoli attivi (${onlyInAttivi.length}) ==`);
  let inseriti = 0;
  const createdVehicleIdByTarga = new Map<string, string>();
  const saltatiSenzaStazione: string[] = [];
  for (const targa of onlyInAttivi) {
    const r = attiviByTarga.get(targa)!;
    const stationId = r.dsCode ? stationIdByCode.get(r.dsCode) : undefined;
    if (!stationId) { saltatiSenzaStazione.push(targa); continue; }
    const stato = r.statoRaw === "SOSTITUTIVO" ? "SOSTITUTIVO" : r.statoRaw === "UFFICIO" ? "UFFICIO" : "ATTIVO";
    const v = await prisma.vehicle.create({
      data: {
        targa,
        modello: `${r.marca} ${r.modello}`.trim(),
        alimentazione: "DIESEL",
        stationId,
        stato,
        leasingCompany: r.societa,
        contrattoLeasingNo: r.ra,
        tipoContratto: r.tipo,
        contrattoDataInizio: r.dataInizio,
        canoneMese: r.tariffa,
        note: r.note,
        stationHistory: { create: { stationId, fromDate: r.dataInizio ?? new Date(), note: "import ricognizione flotta" } },
      },
    });
    createdVehicleIdByTarga.set(targa, v.id);
    inseriti++;
  }
  console.log(`Veicoli creati: ${inseriti}`);
  if (saltatiSenzaStazione.length) console.log(`Saltati (stazione non riconosciuta):`, saltatiSenzaStazione);

  // sostitutivi con targa originale riconoscibile in nota -> ReplacementCase
  console.log(`\n== Pratiche sostitutivo da inserimenti (nota con targa originale) ==`);
  let casiCreati = 0, casiSaltatiOriginaleNonInFlotta = 0;
  for (const targa of onlyInAttivi) {
    const r = attiviByTarga.get(targa)!;
    if (r.statoRaw !== "SOSTITUTIVO" || !r.note) continue;
    const originalPlate = extractPlateRef(r.note);
    if (!originalPlate) continue;
    const originalVehicle = dbByTarga.get(originalPlate);
    if (!originalVehicle) { casiSaltatiOriginaleNonInFlotta++; continue; }
    const substituteId = createdVehicleIdByTarga.get(targa);
    const dataIngresso = r.dataInizio ?? new Date();
    const existing = await prisma.replacementCase.findFirst({ where: { vehicleId: originalVehicle.id, dataIngressoOfficina: dataIngresso } });
    if (existing) continue;
    await prisma.replacementCase.create({
      data: {
        vehicleId: originalVehicle.id,
        motivo: "GUASTO", // motivo non specificato nella fonte: default, correggibile manualmente
        dataIngressoOfficina: dataIngresso,
        centroConvenzionato: r.societa ?? "N/D",
        replacementVehicleId: substituteId ?? null,
        stato: "APERTA",
        note: `Importato da ricognizione flotta — sostitutivo ${targa}. Motivo effettivo da verificare (non presente nella fonte).`,
      },
    });
    casiCreati++;
  }
  console.log(`Pratiche sostitutivo create: ${casiCreati} (${casiSaltatiOriginaleNonInFlotta} scartate: targa originale non in flotta)`);

  // ---------------------------------------------------------------
  // 2) CESSATI: veicoli storici + arricchimento + storico stazioni
  // ---------------------------------------------------------------
  console.log(`\n== Cessati: veicoli storici e storico stazioni ==`);
  let veicoliStoriciCreati = 0, arricchiti = 0, historyCreate = 0;
  const senzaStazione: string[] = [];
  for (const [targa, events] of cessatiByTarga) {
    let vehicle = dbByTarga.get(targa);
    const latest = events[events.length - 1];
    if (!vehicle) {
      const stationId = latest.dsCode ? stationIdByCode.get(latest.dsCode) : undefined;
      if (!stationId) { senzaStazione.push(targa); continue; }
      const created = await prisma.vehicle.create({
        data: {
          targa,
          modello: `${latest.marca} ${latest.modello}`.trim(),
          alimentazione: "DIESEL",
          stationId,
          stato: "DISMESSO",
          leasingCompany: latest.societa,
          contrattoLeasingNo: latest.ra,
          tipoContratto: latest.tipo,
          contrattoDataInizio: latest.dataInizio,
          contrattoDataFine: latest.dataFine,
          note: "Veicolo storico — da ricognizione flotta (foglio Cessati)",
        },
      });
      vehicle = { id: created.id, targa: created.targa, stato: created.stato, modello: created.modello };
      dbByTarga.set(targa, vehicle);
      veicoliStoriciCreati++;
    } else if (vehicle.modello.startsWith("Veicolo storico (dati non disponibili")) {
      // arricchisce con dati reali i placeholder creati da import-multe-2025-2026.ts
      const stationId = latest.dsCode ? stationIdByCode.get(latest.dsCode) : undefined;
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: {
          modello: `${latest.marca} ${latest.modello}`.trim(),
          leasingCompany: latest.societa,
          contrattoLeasingNo: latest.ra,
          tipoContratto: latest.tipo,
          contrattoDataInizio: latest.dataInizio,
          contrattoDataFine: latest.dataFine,
          ...(stationId ? { stationId } : {}),
        },
      });
      arricchiti++;
    }

    for (const e of events) {
      const stationId = e.dsCode ? stationIdByCode.get(e.dsCode) : undefined;
      if (!stationId) continue;
      const dup = await prisma.vehicleStationHistory.findFirst({
        where: { vehicleId: vehicle.id, stationId, fromDate: e.dataInizio },
      });
      if (dup) continue;
      await prisma.vehicleStationHistory.create({
        data: { vehicleId: vehicle.id, stationId, fromDate: e.dataInizio, toDate: e.dataFine, note: e.note },
      });
      historyCreate++;
    }
  }
  console.log(`Veicoli storici creati: ${veicoliStoriciCreati}`);
  console.log(`Veicoli placeholder arricchiti con dati reali: ${arricchiti}`);
  console.log(`Righe storico stazioni create: ${historyCreate}`);
  if (senzaStazione.length) console.log(`Targhe Cessati senza stazione riconoscibile (nessun veicolo creato):`, senzaStazione);

  console.log("\n== Riepilogo finale ==");
  const counts = {
    veicoli: await prisma.vehicle.count(),
    attivi: await prisma.vehicle.count({ where: { stato: "ATTIVO" } }),
    sostitutivi: await prisma.vehicle.count({ where: { stato: "SOSTITUTIVO" } }),
    dismessi: await prisma.vehicle.count({ where: { stato: "DISMESSO" } }),
    storicoRighe: await prisma.vehicleStationHistory.count(),
  };
  console.log(counts);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
