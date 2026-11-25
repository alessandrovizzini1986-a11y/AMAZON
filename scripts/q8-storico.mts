/**
 * Storico Q8 riga per riga: legge i file Excel delle transazioni Q8 già elaborati (MM_Transazioni_<Mese>_<AA>_Q8.xlsx, con la
 * colonna STATION) e scrive un unico JSON con le transazioni nel formato della tabella Q8Transazione, con le stesse chiavi
 * e lo stesso PAN mascherato ("…" + ultime 4 cifre) che scrive il sito. Non tocca nessun database.
 *
 *   npx tsx scripts/q8-storico.mts --segreto <valore> uscita.json file1.xlsx file2.xlsx …
 *
 * Il segreto è il valore della riga "q8.chiave" della tabella SegretoInterno:
 *   select valore from "SegretoInterno" where chiave = 'q8.chiave';
 * Senza lo stesso segreto del sito le chiavi sarebbero diverse e ricaricando il mese dal sito si avrebbero doppioni.
 * Gli storni si abbinano sul PAN intero, prima di mascherarlo. Il segreto non va scritto in nessun file del repository.
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { worksheetToGrid } from "../src/lib/presenze/excelGrid";
import { giornoQ8, transazioniDaEsito, type Q8TransazioneIn } from "../src/domain/carburante/q8Righe";
import { chiaveQ8Da, panMascherato } from "../src/lib/carburante/chiave";

const USO = "Uso: npx tsx scripts/q8-storico.mts --segreto <valore> uscita.json file1.xlsx [file2.xlsx …]";
let segreto = "";
const posizionali: string[] = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "--segreto") segreto = process.argv[++i] ?? "";
  else if (a.startsWith("--segreto=")) segreto = a.slice("--segreto=".length);
  else posizionali.push(a);
}
const [uscita, ...file] = posizionali;
if (!uscita || !file.length || !uscita.toLowerCase().endsWith(".json")) {
  console.error(USO);
  process.exit(1);
}
if (segreto.length < 32) {
  console.error(`Manca --segreto (o è troppo corto): serve il valore intero della riga q8.chiave di SegretoInterno.\n${USO}`);
  process.exit(1);
}

const testo = (v: unknown) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v).trim());

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

  // chiave e PAN come li salva il sito (salvaTransazioniQ8)
  const tx = transazioniDaEsito({ anno, mese, intestazione, righe }).map((t) => ({ ...t, chiave: chiaveQ8Da(t.chiave, segreto), pan: panMascherato(t.pan) }));
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
console.log("Esempi:");
for (const t of [tutte.find((x) => x.station === "DER2"), tutte.find((x) => x.station === "GLS")].filter((x): x is Q8TransazioneIn => !!x)) {
  console.log(JSON.stringify(t));
}
