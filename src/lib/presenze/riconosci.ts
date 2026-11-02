/**
 * Riconoscimento dei file trascinati nell'archivio presenze (lato browser):
 * CSV Amazon, tracking (SIC/STD) o export Zucchetti. Nessun file va al server.
 */
import Papa from "papaparse";
import type { SheetGrid } from "@/domain/presenze/grid";
import { isFlexHeader, parseFlexRows, type FlexRow } from "@/domain/presenze/flex";
import { stationFromName, type Station } from "@/domain/presenze/regole";
import { findTrackingSheet, tipoFromName } from "@/domain/presenze/tracking";
import { isZucchettiName, meseFromZucchettiName, stationFromZucchettiName } from "@/domain/presenze/controlloFineMese";
import { workbookToGrids } from "./excelGrid";

export type KindFile = "TRACKING" | "FLEX" | "ZUCCHETTI";

export type FileLocale = {
  hash: string;
  nome: string;
  size: number;
  caricatoIl: string;
  kind: KindFile;
  station?: Station;
  tipo?: "SIC" | "STD";
  /** mesi coperti "AAAA-MM" */
  mesi: string[];
  /** CSV Amazon: righe per station e giorno */
  giorniFlex?: { station: Station; data: string; righe: number }[];
  righe: number;
  /** Excel originale (rielaborato quando si lancia un controllo) */
  buffer?: ArrayBuffer;
  /** CSV Amazon già letto */
  flexRows?: FlexRow[];
};

export async function sha256(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const MESI_IT = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** Mese da un nome di foglio: "10.26", "10_26", "Ottobre", "Settembre2026", "Marzo 2026". */
function meseDaNomeFoglio(nome: string, annoDefault: number): { anno: number; mese: number } | null {
  const s = nome.trim().toLowerCase();
  let m = /^(\d{1,2})[._](\d{2})$/.exec(s);
  if (m) return { anno: 2000 + Number(m[2]), mese: Number(m[1]) };
  const i = MESI_IT.findIndex((x) => s.startsWith(x));
  if (i >= 0) {
    m = /(\d{4})/.exec(s);
    return { anno: m ? Number(m[1]) : annoDefault, mese: i + 1 };
  }
  return null;
}

const giorniNelMese = (anno: number, mese: number) => new Date(Date.UTC(anno, mese, 0)).getUTCDate();
const vicino = (a: { anno: number; mese: number }, delta: number) => {
  const d = new Date(Date.UTC(a.anno, a.mese - 1 + delta, 1));
  return { anno: d.getUTCFullYear(), mese: d.getUTCMonth() + 1 };
};

/**
 * Mesi coperti da un tracking. Intestazioni-data: si leggono dalle date.
 * Intestazioni 1..31: il mese non è scritto, quindi si prova il mese del nome
 * del foglio, i mesi vicini e il prefisso del nome file ("09_Tracking…"), e si
 * tiene quello i cui giorni coincidono esattamente con le colonne (trappola
 * DLZ2: foglio "08.26" che contiene settembre).
 */
function mesiTracking(sheets: SheetGrid[], fileName: string): string[] {
  const mesi = new Set<string>();
  const oggi = new Date();
  const anno = oggi.getFullYear();
  const pref = /^(\d{2})_/.exec(fileName);
  const prefMese = pref && Number(pref[1]) >= 1 && Number(pref[1]) <= 12 ? Number(pref[1]) : null;
  for (const g of sheets) {
    const hint = meseDaNomeFoglio(g.name, anno);
    const tent: { anno: number; mese: number }[] = [];
    if (hint) tent.push(hint, vicino(hint, 1), vicino(hint, -1));
    if (prefMese) tent.push({ anno: hint?.anno ?? anno, mese: prefMese });
    tent.push({ anno, mese: oggi.getMonth() + 1 });
    const esatti: string[] = [];
    let fallback: string | null = null;
    for (const t of tent) {
      let ts;
      try { ts = findTrackingSheet([g], t.anno, t.mese); } catch { continue; }
      const conDate = (g.rows[ts.headerRow] ?? []).some((v) => v instanceof Date);
      if (conDate) {
        const conta = new Map<string, number>();
        for (const d of ts.dayCols) conta.set(d.date.slice(0, 7), (conta.get(d.date.slice(0, 7)) ?? 0) + 1);
        for (const [m, n] of conta) if (n >= 15) mesi.add(m);
        break;
      }
      const key = `${t.anno}-${String(t.mese).padStart(2, "0")}`;
      const n = ts.dayCols.filter((d) => d.date.startsWith(key + "-")).length;
      if (n === giorniNelMese(t.anno, t.mese)) esatti.push(key);
      else if (!fallback && hint && t === tent[0] && n >= 15) fallback = key;
    }
    const scelto = esatti.find((k) => prefMese && Number(k.slice(5)) === prefMese) ?? esatti[0] ?? fallback;
    if (scelto) mesi.add(scelto);
  }
  return [...mesi].sort();
}

/** Legge e classifica un file. Lancia un errore con il motivo se non è riconosciuto. */
export async function riconosci(file: File): Promise<FileLocale> {
  const buffer = await file.arrayBuffer();
  const hash = await sha256(buffer);
  const base = { hash, nome: file.name, size: file.size, caricatoIl: new Date().toISOString() };
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".csv")) {
    const text = new TextDecoder("utf-8").decode(buffer).replace(/^﻿/, "");
    const table = Papa.parse<string[]>(text, { skipEmptyLines: true }).data;
    if (!table.length || !isFlexHeader(table[0])) throw new Error("CSV non riconosciuto: non è un export Amazon \"Addetti alla consegna\"");
    const f = parseFlexRows(table, file.name);
    if (!f.rows.length) throw new Error("CSV Amazon senza righe valide");
    const per = new Map<string, { station: Station; data: string; righe: number }>();
    for (const r of f.rows) {
      const k = `${r.station}|${r.data}`;
      const x = per.get(k);
      if (x) x.righe++;
      else per.set(k, { station: r.station, data: r.data, righe: 1 });
    }
    const giorniFlex = [...per.values()].sort((a, b) => (a.station + a.data).localeCompare(b.station + b.data));
    return { ...base, kind: "FLEX", mesi: [...new Set(f.giorni.map((d) => d.slice(0, 7)))].sort(), giorniFlex, righe: f.rows.length, flexRows: f.rows, station: f.stations.length === 1 ? f.stations[0] : undefined };
  }

  if (!/\.xls[xm]$/.test(lower)) throw new Error("formato non gestito: servono .xlsx, .xlsm o .csv");
  const sheets = await workbookToGrids(buffer);

  if (isZucchettiName(file.name)) {
    const station = stationFromZucchettiName(file.name)!;
    const m = meseFromZucchettiName(file.name)!;
    const orari = sheets.find((s) => s.name === "ORARI");
    if (!orari) throw new Error("export Zucchetti senza foglio ORARI");
    const righe = orari.rows.filter((r) => String(r?.[5] ?? "").trim().toUpperCase() === "TOTALE").length;
    if (!righe) throw new Error("export Zucchetti senza righe TOTALE");
    return { ...base, kind: "ZUCCHETTI", station, mesi: [`${m.anno}-${String(m.mese).padStart(2, "0")}`], righe, buffer };
  }

  const station = stationFromName(file.name);
  if (!station) throw new Error("station non trovata nel nome del file (deve contenere DER1, DLO2, …)");
  const tipo = tipoFromName(file.name);
  if (!tipo) throw new Error("popolazione non trovata nel nome del file (deve contenere SIC o STD)");
  if (!sheets.some((g) => g.rows.slice(0, 8).some((r) => (r ?? []).some((v) => String(v ?? "").trim().toLowerCase() === "tipo")))) {
    throw new Error('riga di intestazione con "Tipo" assente: non sembra un tracking');
  }
  const mesi = mesiTracking(sheets, file.name);
  if (!mesi.length) throw new Error("nessun foglio del mese riconosciuto (date o nome foglio tipo 10.26 / Ottobre)");
  const righe = sheets.reduce((s, g) => s + g.rows.length, 0);
  return { ...base, kind: "TRACKING", station, tipo, mesi, righe, buffer };
}
