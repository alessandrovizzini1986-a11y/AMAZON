/**
 * Import una tantum di denunce sinistri/danni da export assicurativo
 * ("Elenco Denunce Sinistri") — match per targa su veicoli già in flotta.
 * Le targhe non presenti nel nostro DB (altra gestione Professional
 * Solutions non di nostra competenza) vengono saltate e riportate.
 *
 * Uso: npx tsx scripts/import-danni-2025.ts --file /path/danni_e_denuncia.xlsx
 *
 * Mappatura:
 *  - praticaAssicurativa = NUMERO DENUNCIA (anche chiave anti-duplicato)
 *  - tipo = DESCRIZIONE DANNI (breve, es. "BOTTA PARAURTI POSTERIORE")
 *  - descrizione = DESCRIZIONE EVENTO + LOCALITA'
 *  - data = DATA EVENTO
 *  - chiuso = true se STATO=CLOSED, false altrimenti (ACCEPTED)
 *  - responsabilita = "Senza Controparte" -> DRIVER, "Con Controparte" -> IGNOTO
 *    (assunzione dichiarata: senza controparte è quasi sempre causato dal
 *    conducente stesso; con controparte la colpa va accertata caso per caso)
 *  - righe con STATO=DELETED vengono scartate
 */
import ExcelJS from "exceljs";
import { PrismaClient, LiableParty } from "@prisma/client";

const prisma = new PrismaClient();

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`Argomento mancante: --${name}`);
  return process.argv[i + 1];
}

/** Le colonne data sono stringhe testuali "MM/DD/YYYY HH:MM:SS" (formato US), non celle data Excel. */
function parseUsDateTime(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, mo, d, y, h, mi, se] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +(h ?? 0), +(mi ?? 0), +(se ?? 0)));
}

/** "BLANK" è un placeholder letterale usato nella fonte per "nessuna descrizione". */
function normalizeBlank(v: unknown): string {
  const s = String(v ?? "").trim();
  return s.toUpperCase() === "BLANK" ? "" : s;
}

async function main() {
  const filePath = arg("file");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet("Elenco Denunce Sinistri")!;

  type Row = {
    numeroDenuncia: string; targa: string; dataEvento: Date | null;
    tipologia: string; stato: string; localita: string;
    descrizioneEvento: string; descrizioneDanni: string;
  };
  const rows: Row[] = [];
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

  const vehicles = await prisma.vehicle.findMany({ select: { id: true, targa: true } });
  const byTarga = new Map(vehicles.map((v) => [v.targa.toUpperCase(), v]));

  const existing = await prisma.damage.findMany({ select: { praticaAssicurativa: true } });
  const seenPratiche = new Set(existing.map((d) => d.praticaAssicurativa).filter(Boolean));

  let created = 0, skippedNotInDb = 0, skippedDuplicate = 0, skippedNoDate = 0;
  const notInDb = new Set<string>();
  for (const r of rows) {
    const v = byTarga.get(r.targa);
    if (!v) { skippedNotInDb++; notInDb.add(r.targa); continue; }
    if (r.numeroDenuncia && seenPratiche.has(r.numeroDenuncia)) { skippedDuplicate++; continue; }
    if (!r.dataEvento) { skippedNoDate++; continue; }
    seenPratiche.add(r.numeroDenuncia);

    const responsabilita: LiableParty = r.tipologia === "Senza Controparte" ? "DRIVER" : "IGNOTO";
    const descrizione = [r.descrizioneEvento, r.localita ? `Località: ${r.localita}` : null]
      .filter(Boolean).join(" — ") || null;

    await prisma.damage.create({
      data: {
        vehicleId: v.id,
        tipo: r.descrizioneDanni || r.tipologia || "Danno non specificato",
        data: r.dataEvento,
        descrizione,
        responsabilita,
        praticaAssicurativa: r.numeroDenuncia || null,
        chiuso: r.stato === "CLOSED",
        reporterId: null,
      },
    });
    created++;
  }

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  await prisma.auditLog.create({
    data: {
      userId: admin?.id ?? null,
      action: "import.danni.denunce",
      entity: "Damage",
      meta: { created, skippedNotInDb, skippedDuplicate, skippedNoDate, targheNonInDb: [...notInDb] },
    },
  });

  console.log("\n== Riepilogo ==");
  console.log(`Damage creati: ${created}`);
  console.log(`Saltati (targa non in DB): ${skippedNotInDb}`, [...notInDb]);
  console.log(`Saltati (duplicati su praticaAssicurativa): ${skippedDuplicate}`);
  console.log(`Saltati (senza data evento valida): ${skippedNoDate}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
