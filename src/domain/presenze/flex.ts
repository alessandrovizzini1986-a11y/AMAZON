/**
 * CSV Amazon "Addetti alla consegna" (un file per station e giorno, oppure il
 * CSV unito con la colonna Station). Parsing puro sul testo del file.
 */
import { num } from "./grid";
import { STATIONS, type Station } from "./regole";

export type FlexRow = {
  station: Station;
  data: string; // AAAA-MM-GG
  nome: string;
  driverId: string; // maiuscolo
  pacchi: number;
  spediti: number;
};

export type FlexFile = { rows: FlexRow[]; stations: Station[]; giorni: string[] };

/** Intestazione del CSV Amazon (con o senza la colonna Station davanti). */
export function isFlexHeader(cols: string[]): boolean {
  const c = cols.map((x) => x.replace(/^﻿/, "").trim().toLowerCase().replace("’", "'"));
  const i = c[0] === "station" ? 1 : 0;
  return c[i] === "data" && (c[i + 1] ?? "").startsWith("nome dell'addetto") && (c[i + 2] ?? "").startsWith("id addetto");
}

/** Station dal nome file: DER1_26_10_26.csv, DER1_5.csv, cartella/DER1 … */
export function stationFromCsvName(name: string): Station | null {
  const up = name.toUpperCase();
  return STATIONS.find((s) => new RegExp(`(^|[\\\\/_\\- ])${s}([_\\- .]|$)`).test(up)) ?? STATIONS.find((s) => up.includes(s)) ?? null;
}

/**
 * Righe del CSV già divise in colonne (PapaParse o simili) → FlexRow.
 * Colonne cercate per inizio del nome come lo script v2.
 */
export function parseFlexRows(table: string[][], fileName: string): FlexFile {
  if (table.length === 0) throw new Error("file vuoto");
  const header = table[0].map((h) => h.replace(/^﻿/, "").trim().replace("’", "'"));
  if (!isFlexHeader(header)) throw new Error("intestazione non riconosciuta (attesa: Data, Nome dell'addetto alla consegna, ID addetto alle consegne, …)");
  const col = (name: string) => header.findIndex((h) => h.toLowerCase().startsWith(name.toLowerCase()));
  const cStation = col("Station");
  const cData = col("Data");
  const cNome = col("Nome dell'addetto");
  const cId = col("ID addetto");
  const cPacchi = col("Pacchi consegnati");
  const cSpediti = col("Pacchi spediti");
  const fromName = stationFromCsvName(fileName);
  if (cStation < 0 && !fromName) throw new Error("station non trovata nel nome del file (atteso es. DER1_26_10_26.csv)");

  const rows: FlexRow[] = [];
  for (const r of table.slice(1)) {
    if (!r || r.every((v) => !v || !v.trim())) continue;
    const st = (cStation >= 0 ? (r[cStation] ?? "").trim().toUpperCase() : fromName) as Station | null;
    if (!st || !STATIONS.includes(st)) continue;
    const data = (r[cData] ?? "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) continue;
    const driverId = (r[cId] ?? "").trim().toUpperCase();
    if (!driverId) continue;
    rows.push({
      station: st,
      data,
      nome: (r[cNome] ?? "").trim(),
      driverId,
      pacchi: Math.trunc(num(r[cPacchi] ?? "")),
      spediti: cSpediti >= 0 ? Math.trunc(num(r[cSpediti] ?? "")) : 0,
    });
  }
  return {
    rows,
    stations: [...new Set(rows.map((r) => r.station))].sort(),
    giorni: [...new Set(rows.map((r) => r.data))].sort(),
  };
}
