import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

export const FIX = path.join(process.cwd(), "tests", "fixtures", "fatture-amazon");
export const fix = (...p: string[]) => path.join(FIX, ...p);

/** CSV del kit: separatore ";", UTF-8, campi tra virgolette con a capo ammessi. */
export function csv(...p: string[]): Record<string, string>[] {
  const r = Papa.parse<Record<string, string>>(fs.readFileSync(fix(...p), "utf8").replace(/^﻿/, ""), { delimiter: ";", header: true, skipEmptyLines: true });
  return r.data;
}
/** Numero italiano "1.234,56" o "0.22" → number */
export const numIt = (s: string) => (s.includes(",") ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : parseFloat(s));
