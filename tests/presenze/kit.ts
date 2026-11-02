/** Accesso al kit docs/presenze-kit (file reali, solo in locale: i test golden si saltano se mancano). */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import Papa from "papaparse";
import { workbookToGrids } from "@/lib/presenze/excelGrid";
import { parseFlexRows } from "@/domain/presenze/flex";
import { stationFromName } from "@/domain/presenze/regole";
import { tipoFromName } from "@/domain/presenze/tracking";
import type { TrackingInput } from "@/domain/presenze/controlloSettimanale";

export const KIT = path.join(process.cwd(), "docs", "presenze-kit");
export const hasKit = fs.existsSync(path.join(KIT, "esempi")) && fs.existsSync(path.join(KIT, "attesi"));

export async function loadTracking(dir: string): Promise<TrackingInput[]> {
  const out: TrackingInput[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => /\.xls[xm]$/i.test(x) && !x.startsWith("~$"))) {
    const sheets = await workbookToGrids(fs.readFileSync(path.join(dir, f)));
    out.push({ station: stationFromName(f)!, tipo: tipoFromName(f)!, fileName: f, sheets });
  }
  return out;
}

export function loadFlex(file: string) {
  const text = fs.readFileSync(file, "utf-8").replace(/^﻿/, "");
  const table = Papa.parse<string[]>(text, { skipEmptyLines: true }).data;
  return parseFlexRows(table, path.basename(file));
}

const xmlDecode = (t: string) =>
  t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/**
 * Foglio di un Excel atteso → righe oggetto (intestazione in riga 1).
 * Lettore minimo su XML: i file attesi hanno tabelle scritte da openpyxl che
 * ExcelJS non riesce a leggere. Le date restano numeri seriali Excel.
 */
export async function readSheet(file: string, sheet: string): Promise<Record<string, unknown>[]> {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const wbXml = await zip.file("xl/workbook.xml")!.async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const m = [...wbXml.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].find((x) => xmlDecode(x[1]) === sheet);
  if (!m) throw new Error(`foglio ${sheet} non trovato in ${file}`);
  const target = new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`Target="([^"]+)"[^>]*Id="${m[2]}"`).exec(rels)![1];
  const sheetXml = await zip.file("xl/" + target.replace(/^\/?xl\//, ""))!.async("string");
  const ssFile = zip.file("xl/sharedStrings.xml");
  const shared = ssFile
    ? [...(await ssFile.async("string")).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((x) => xmlDecode([...x[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")))
    : [];
  const colIdx = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const rows: unknown[][] = [];
  for (const rm of sheetXml.matchAll(/<row [^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const r: unknown[] = [];
    for (const cm of rm[2].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[2];
      const inner = cm[3] ?? "";
      const t = /t="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let val: unknown = null;
      if (t === "s" && v !== undefined) val = shared[Number(v)];
      else if (t === "inlineStr") val = xmlDecode([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
      else if (t === "str" || t === "e") val = v !== undefined ? xmlDecode(v) : null;
      else if (t === "b") val = v === "1";
      else if (v !== undefined) val = Number(v);
      r[colIdx(cm[1])] = val;
    }
    rows[Number(rm[1]) - 1] = r;
  }
  const hdr = (rows[0] ?? []).map((v) => String(v ?? ""));
  return rows.slice(1).filter(Boolean).map((r) => Object.fromEntries(hdr.map((h, i) => [h, r[i] ?? null])));
}

/** Data di un file atteso (Date o seriale Excel) → AAAA-MM-GG */
export const iso = (v: unknown) => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000).toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};
