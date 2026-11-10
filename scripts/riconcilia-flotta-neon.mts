/**
 * Riconciliazione flotta sul DB del sito (Neon, via HTTP): Lista Targhe + fatture noleggiatori.
 * Regole: src/domain/flotta/riconcilia.ts · prompt: docs/flotta-kit/PROMPT_aggiorna_targhe_tariffe.md
 *
 * Uso (dry-run, non scrive):
 *   NEON_URL=... npx tsx scripts/riconcilia-flotta-neon.mts --lista Lista_Targhe.xlsx \
 *     [--ald ALD.xlsx] [--arval ARVAL.xlsx] [--avis AVIS.xlsx] [--europcar EUROPCAR.xlsx] [--report out.xlsx]
 * Con --applica scrive sul sito in una sola transazione e registra il riepilogo nel log di audit.
 * Con --preferisci-sito il canone già sul sito (es. preso da una fattura) non viene sostituito dalla tariffa della Lista.
 * La Lista si legge a flusso (matriceFoglio): ExcelJS non apre il file per i filtri delle tabelle.
 */
import crypto from "node:crypto";
import ExcelJS from "exceljs";
import { neon } from "@neondatabase/serverless";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import { datiDaLista, perStation, riconcilia, type FatturaRiga, type VeicoloSito } from "../src/domain/flotta/riconcilia";
import { readFileSync } from "node:fs";
import { matriceFoglio } from "../src/lib/fatture/xlsxStream";
import { leggiFattureAld, leggiFattureArval, leggiFattureAvis, leggiFattureEuropcar, leggiListaAttivi, leggiListaCessati, type Matrice } from "../src/lib/flotta/leggi";

if (process.env.HTTPS_PROXY) setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));
if (!process.env.NEON_URL) throw new Error("NEON_URL mancante");
const sql = neon(process.env.NEON_URL);
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const APPLICA = process.argv.includes("--applica");

async function matrici(file: string, fogli?: string[]): Promise<Record<string, Matrice>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const out: Record<string, Matrice> = {};
  for (const ws of wb.worksheets) {
    if (fogli && !fogli.includes(ws.name)) continue;
    const m: Matrice = [];
    ws.eachRow({ includeEmpty: true }, (r, n) => { m[n - 1] = (r.values as unknown[]).slice(1); });
    out[ws.name] = Array.from(m, (r) => r ?? []);
  }
  return out;
}
const primo = async (f: string) => Object.values(await matrici(f))[0];

const buf = readFileSync(arg("lista")!); const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
const lista = leggiListaAttivi((await matriceFoglio(ab, "Attivi")) as Matrice), cessati = leggiListaCessati((await matriceFoglio(ab, "Cessati")) as Matrice);
const PREFERISCI_SITO = process.argv.includes("--preferisci-sito");
const fatture: FatturaRiga[] = [];
if (arg("ald")) fatture.push(...leggiFattureAld(await primo(arg("ald")!)));
if (arg("arval")) fatture.push(...leggiFattureArval(await primo(arg("arval")!)));
if (arg("avis")) fatture.push(...leggiFattureAvis(await primo(arg("avis")!)));
// più file dello stesso fornitore separati da virgola (es. Europcar settembre,ottobre): vale l'ultimo mese pieno per targa
for (const f of (arg("europcar") ?? "").split(",").filter(Boolean)) { const m = await matrici(f); fatture.push(...leggiFattureEuropcar(m["Professional Solution"] ?? Object.values(m)[0])); }

const stazioni = (await sql.query(`SELECT id, code FROM "Station"`)) as { id: string; code: string }[];
const idStation = new Map(stazioni.map((s) => [s.code, s.id]));
const righe = (await sql.query(`SELECT v.id, v.targa, s.code station, v.stato::text stato, v.modello, v."leasingCompany", v."tipoContratto"::text "tipoContratto", v."contrattoLeasingNo",
  v."contrattoDataInizio"::date::text "contrattoDataInizio", v."contrattoDataFine"::date::text "contrattoDataFine", v."canoneMese"::float "canoneMese", v.note, v."franchigiaDanni"::float "franchigiaDanni", v."updatedAt"::text "updatedAt"
  FROM "Vehicle" v JOIN "Station" s ON s.id = v."stationId"`)) as VeicoloSito[];

const e = riconcilia({ lista, cessati, fatture, sito: righe, preferisciSito: PREFERISCI_SITO });
const prima = perStation(righe);
console.log(`Lista: ${lista.length} attivi · Cessati: ${cessati.length} righe · fatture: ${fatture.length} righe`);
console.log({ crea: e.crea.length, riattiva: e.riattiva.length, aggiorna: e.aggiorna.length, dismetti: e.dismetti.length, daVerificare: e.daVerificare.map((d) => d.veicolo.targa) });
const conta: Record<string, number> = {};
for (const a of e.aggiorna) for (const c of a.cambi) conta[c.campo] = (conta[c.campo] ?? 0) + 1;
console.log("campi aggiornati", conta);
const anom: Record<string, number> = {};
for (const a of e.anomalie) anom[a.tipo] = (anom[a.tipo] ?? 0) + 1;
console.log("anomalie", anom);
const senzaStation = [...e.crea.map((c) => c.lista), ...e.riattiva.map((r) => r.lista)].filter((r) => !idStation.has(r.station)).map((r) => `${r.targa} ${r.station}`);
if (senzaStation.length) throw new Error(`station non presenti sul sito: ${senzaStation.join(", ")}`);

if (arg("report")) {
  const wb = new ExcelJS.Workbook();
  const foglio = (nome: string, col: string[], rows: unknown[][]) => {
    const ws = wb.addWorksheet(nome);
    ws.addTable({ name: nome.replace(/\W/g, "_"), ref: "A1", headerRow: true, style: { theme: "TableStyleMedium2", showRowStripes: true }, columns: col.map((name) => ({ name, filterButton: true })), rows: rows.length ? rows : [col.map(() => "")] });
    ws.columns.forEach((c) => { c.width = 18; });
  };
  foglio("Nuove", ["Targa", "Station", "Stato", "Società", "Tipo", "Inizio", "Canone", "Fonte canone"], e.crea.map((c) => [c.lista.targa, c.lista.station, c.lista.stato, c.lista.societa, c.lista.tipo, c.lista.inizio, c.canone, c.fonteCanone]));
  foglio("Riattivate", ["Targa", "Station", "Stato", "Società", "Cambi"], e.riattiva.map((r) => [r.lista.targa, r.lista.station, r.lista.stato, r.lista.societa, r.cambi.map((c) => `${c.campo}: ${c.prima ?? "—"} → ${c.dopo}`).join("; ")]));
  foglio("Uscite", ["Targa", "Station", "Stato sito", "Società", "Cessata il", "Station Cessati"], e.dismetti.map((d) => [d.veicolo.targa, d.veicolo.station, d.veicolo.stato, d.veicolo.leasingCompany, d.cessato.fine, d.cessato.station]));
  foglio("Cambi", ["Targa", "Station", "Campo", "Prima", "Dopo"], e.aggiorna.flatMap((a) => a.cambi.map((c) => [a.veicolo.targa, a.veicolo.station, c.campo, c.prima, c.dopo])));
  foglio("Canoni", ["Targa", "Station", "Società", "Lista", "Fattura", "Mese fattura", "Sito prima", "Scelto", "Fonte"], e.canoni.map((c) => [c.targa, c.station, c.societa, c.lista, c.fattura?.importo ?? null, c.fattura?.mese ?? null, c.sito, c.scelto, c.fonte]));
  foglio("Anomalie", ["Tipo", "Targa", "Fornitore", "Mese", "Importo", "Dettaglio"], e.anomalie.map((a) => [a.tipo, a.targa, a.fornitore, a.mese, a.importo, a.dettaglio]));
  foglio("Da verificare", ["Targa", "Station", "Stato", "Società", "Motivo"], e.daVerificare.map((d) => [d.veicolo.targa, d.veicolo.station, d.veicolo.stato, d.veicolo.leasingCompany, d.motivo]));
  await wb.xlsx.writeFile(arg("report")!);
  console.log("report:", arg("report"));
}

if (!APPLICA) { console.log("dry-run: nessuna scrittura (aggiungi --applica)"); process.exit(0); }

const COL: Record<string, string> = { station: `"stationId"`, stato: "stato", leasingCompany: `"leasingCompany"`, tipoContratto: `"tipoContratto"`, contrattoLeasingNo: `"contrattoLeasingNo"`, contrattoDataInizio: `"contrattoDataInizio"`, contrattoDataFine: `"contrattoDataFine"`, note: "note", canoneMese: `"canoneMese"`, franchigiaDanni: `"franchigiaDanni"` };
const CAST: Record<string, string> = { stato: `::"VehicleStatus"`, tipoContratto: `::"ContractType"`, contrattoDataInizio: "::timestamp", contrattoDataFine: "::timestamp" };
const cid = () => "c" + crypto.randomBytes(12).toString("hex").slice(0, 24);
const q: ReturnType<typeof sql.query>[] = [];
const oggi = new Date().toISOString().slice(0, 10);

// 1) uscite prima (indice unico sulla targa tra i non dismessi)
for (const d of e.dismetti) {
  q.push(sql.query(`UPDATE "Vehicle" SET stato = 'DISMESSO', "contrattoDataFine" = COALESCE("contrattoDataFine", $2::timestamp), "updatedAt" = now() WHERE id = $1`, [d.veicolo.id, d.cessato.fine]));
  q.push(sql.query(`UPDATE "VehicleStationHistory" SET "toDate" = $2::timestamp WHERE "vehicleId" = $1 AND "toDate" IS NULL`, [d.veicolo.id, d.cessato.fine ?? oggi]));
}
// 2) aggiornamenti e riattivazioni
const aggiorna = (id: string, cambi: { campo: string; dopo: unknown }[], storicoDal: string | null) => {
  const set: string[] = [], val: unknown[] = [id];
  for (const c of cambi) {
    const v = c.campo === "station" ? idStation.get(String(c.dopo)) : c.dopo;
    val.push(v);
    set.push(`${COL[c.campo]} = $${val.length}${CAST[c.campo] ?? ""}`);
  }
  if (set.length) q.push(sql.query(`UPDATE "Vehicle" SET ${set.join(", ")}, "updatedAt" = now() WHERE id = $1`, val));
  const st = cambi.find((c) => c.campo === "station");
  if (st || storicoDal) {
    const sid = idStation.get(String(st?.dopo ?? "")) ?? null;
    if (st) q.push(sql.query(`UPDATE "VehicleStationHistory" SET "toDate" = now() WHERE "vehicleId" = $1 AND "toDate" IS NULL`, [id]));
    if (sid || storicoDal) q.push(sql.query(`INSERT INTO "VehicleStationHistory" (id, "vehicleId", "stationId", "fromDate", note) SELECT $1, $2, COALESCE($3, "stationId"), $4::timestamp, 'riconciliazione flotta ' || $5 FROM "Vehicle" WHERE id = $2`, [cid(), id, sid, storicoDal ?? oggi, oggi]));
  }
};
for (const a of e.aggiorna) aggiorna(a.veicolo.id, a.cambi, null);
for (const r of e.riattiva) {
  const cambi = [...r.cambi];
  if (!cambi.some((c) => c.campo === "stato")) cambi.push({ campo: "stato", prima: "DISMESSO", dopo: datiDaLista(r.lista, null).stato });
  aggiorna(r.veicolo.id, cambi, r.lista.inizio ?? oggi);
}
// 3) nuove
for (const c of e.crea) {
  const d = datiDaLista(c.lista, c.canone);
  const id = cid();
  q.push(sql.query(`INSERT INTO "Vehicle" (id, targa, modello, alimentazione, "stationId", stato, "leasingCompany", "tipoContratto", "contrattoLeasingNo", "contrattoDataInizio", "contrattoDataFine", note, "canoneMese", "franchigiaDanni", "updatedAt")
    VALUES ($1, $2, $3, 'DIESEL', $4, $5::"VehicleStatus", $6, $7::"ContractType", $8, $9::timestamp, $10::timestamp, $11, $12, $13, now())`,
    [id, d.targa, d.modello, idStation.get(d.station), d.stato, d.leasingCompany, d.tipoContratto, d.contrattoLeasingNo, d.contrattoDataInizio, d.contrattoDataFine, d.note, d.canoneMese, d.franchigiaDanni]));
  q.push(sql.query(`INSERT INTO "VehicleStationHistory" (id, "vehicleId", "stationId", "fromDate", note) VALUES ($1, $2, $3, $4::timestamp, 'riconciliazione flotta ' || $5)`, [cid(), id, idStation.get(d.station), d.contrattoDataInizio ?? oggi, oggi]));
}
q.push(sql.query(`INSERT INTO "AuditLog" (id, action, entity, meta) VALUES ($1, 'flotta.riconciliazione', 'Vehicle', $2::jsonb)`, [cid(), JSON.stringify({ lista: arg("lista")?.split("/").at(-1), crea: e.crea.length, riattiva: e.riattiva.length, aggiorna: e.aggiorna.length, dismetti: e.dismetti.length, daVerificare: e.daVerificare.map((d) => d.veicolo.targa), campi: conta, anomalie: anom })]));

await sql.transaction(q);
console.log(`scritto: ${q.length} istruzioni in una transazione`);
const dopo = perStation((await sql.query(`SELECT s.code station, v.stato::text stato, v."canoneMese"::float "canoneMese" FROM "Vehicle" v JOIN "Station" s ON s.id = v."stationId"`)) as { station: string; stato: string; canoneMese: number | null }[]);
console.table(Object.fromEntries(Object.keys({ ...prima, ...dopo }).sort().map((s) => [s, { prima: prima[s]?.n ?? 0, dopo: dopo[s]?.n ?? 0, "canone prima": prima[s]?.canone ?? 0, "canone dopo": dopo[s]?.canone ?? 0 }])));
