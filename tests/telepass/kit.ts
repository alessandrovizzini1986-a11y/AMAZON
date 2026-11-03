import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import Papa from "papaparse";
import { workbookToGrids } from "@/lib/presenze/excelGrid";

export const KIT = path.join(process.cwd(), "docs", "telepass-q8-kit");
export const hasKit = fs.existsSync(path.join(KIT, "esempi")) && fs.existsSync(path.join(KIT, "attesi"));
export const esempio = (f: string) => path.join(KIT, "esempi", f);
export const atteso = (f: string) => path.join(KIT, "attesi", f);
export const grids = async (f: string) => workbookToGrids(fs.readFileSync(f));
export const csv = (f: string) => Papa.parse<string[]>(fs.readFileSync(f, "utf8").replace(/^﻿/, ""), { delimiter: ";" }).data;
export const tmp = (nome: string) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tq8-")), nome);

/** python3 + openpyxl disponibili? (servono solo per il confronto cella per cella) */
export const hasOpenpyxl = spawnSync("python3", ["-c", "import openpyxl"]).status === 0;

/** Confronto cella per cella (valori, formule, formati numerici) con openpyxl, nei due sensi. */
export function confronta(a: string, b: string): { differenze: number; output: string } {
  const script = path.join(process.cwd(), "tests", "telepass", "confronta_xlsx.py");
  let tot = 0, out = "";
  for (const [x, y] of [[a, b], [b, a]]) {
    const p = spawnSync("python3", ["-I", script, x, y], { encoding: "utf8", maxBuffer: 1 << 26 });
    out += p.stdout + p.stderr;
    const m = /differenze (\d+)/.exec(p.stdout);
    tot += m ? Number(m[1]) : 1;
    if (!/fogli True/.test(p.stdout)) tot += 1;
  }
  return { differenze: tot, output: out };
}
