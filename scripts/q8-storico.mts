/**
 * Storico Q8 riga per riga: legge i file Excel delle transazioni Q8 già elaborati (MM_Transazioni_<Mese>_<AA>_Q8.xlsx, con la
 * colonna STATION) e scrive un unico JSON con le transazioni nel formato della tabella Q8Transazione. Non tocca nessun database.
 *
 *   npx tsx scripts/q8-storico.mts uscita.json file1.xlsx file2.xlsx …
 *
 * Il JSON contiene i PAN delle carte: tenerlo fuori dal repository.
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { worksheetToGrid } from "../src/lib/presenze/excelGrid";
import { giornoQ8, transazioniDaEsito, type Q8TransazioneIn } from "../src/domain/carburante/q8Righe";

const [uscita, ...file] = process.argv.slice(2);
if (!uscita || !file.length || !uscita.toLowerCase().endsWith(".json")) {
  console.error("Uso: npx tsx scripts/q8-storico.mts uscita.json file1.xlsx [file2.xlsx …]");
  process.exit(1);
}

const testo = (v: unknown) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v).trim());
const maschera = (pan: string) => (pan.length > 8 ? `${pan.slice(0, 4)}${"*".repeat(pan.length - 8)}${pan.slice(-4)}` : "****");

const tutte: Q8TransazioneIn[] = [];
for (const f of file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(f);
  const ws = wb.worksheets.find((w) => w.name.includes("Transazioni")) ?? wb.worksheets[0];
  if (!ws) throw new Error(`${path.basename(f)}: nessun foglio`);
  // celle formula → .result, date → Date con i componenti UTC uguali all'ora italiana scritta nel file
  const g = worksheetToGrid(ws);
  const hr = g.rows.slice(0, 3).findIndex((r) => (r ?? []).some((v) => testo(v) === "PAN Carta"));
  if (hr < 0) throw new Error(`${path.basename(f)}: nel foglio "${ws.name}" manca l'intestazione con "PAN Carta" nelle prime 3 righe`);
  const intestazione = (g.rows[hr] ?? []).map(testo);
  const righe = g.rows.slice(hr + 1).filter((r) => r && r.some((v) => v !== null && v !== ""));

  // anno e mese: il mese più frequente nella colonna Data (a pari merito vince il primo incontrato)
  const iData = intestazione.indexOf("Data");
  if (iData < 0) throw new Error(`${path.basename(f)}: manca la colonna "Data"`);
  const conta = new Map<string, number>();
  for (const r of righe) { const gg = giornoQ8(r[iData] ?? null); if (gg) conta.set(gg.slice(0, 7), (conta.get(gg.slice(0, 7)) ?? 0) + 1); }
  if (!conta.size) throw new Error(`${path.basename(f)}: nessuna data valida nella colonna Data`);
  const [meseFile] = [...conta.entries()].reduce((a, b) => (b[1] > a[1] ? b : a));
  const [anno, mese] = meseFile.split("-").map(Number);

  const tx = transazioniDaEsito({ anno, mese, intestazione, righe });
  console.log(`${path.basename(f)} → foglio "${ws.name}", mese ${meseFile}: ${righe.length} righe, ${tx.length} transazioni, ${righe.length - tx.length} scartate (senza data o litri)`);
  tutte.push(...tx);
}

// la stessa transazione in due file diversi: nel database ne resta una (la chiave è unica)
const doppie = tutte.length - new Set(tutte.map((t) => t.chiave)).size;
fs.writeFileSync(uscita, JSON.stringify(tutte));
console.log(`\nScritte ${tutte.length} transazioni in ${uscita}${doppie ? ` (${doppie} con la stessa chiave in file diversi)` : ""}`);

const gruppo = (s: string | null) => (s === "DER2" || s === "GLS" ? s : "altre");
const per = new Map<string, { DER2: number; GLS: number; altre: number; tot: number }>();
for (const t of tutte) {
  const x = per.get(t.mese) ?? { DER2: 0, GLS: 0, altre: 0, tot: 0 };
  x[gruppo(t.station)]++; x.tot++;
  per.set(t.mese, x);
}
console.table(Object.fromEntries([...per.entries()].sort().map(([m, x]) => [m, x])));
console.log("Esempi (PAN mascherato):");
for (const t of [tutte.find((x) => x.station === "DER2"), tutte.find((x) => x.station === "GLS")].filter((x): x is Q8TransazioneIn => !!x)) {
  console.log(JSON.stringify({ ...t, pan: maschera(t.pan), chiave: t.chiave.replace(t.pan, maschera(t.pan)) }));
}
