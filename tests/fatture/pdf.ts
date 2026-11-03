import fs from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.js";
import type { ItemPdf } from "@/domain/fatture/parser";

/** Pagine di un PDF come le legge il browser (stessa versione di pdf.js). */
export async function pagine(file: string | Uint8Array): Promise<ItemPdf[][]> {
  const data = typeof file === "string" ? new Uint8Array(fs.readFileSync(file)) : file;
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const out: ItemPdf[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out.push(tc.items.map((x) => { const it = x as { str: string; transform: number[] }; return { str: it.str ?? "", x: it.transform?.[4] ?? 0, y: it.transform?.[5] ?? 0 }; }));
  }
  return out;
}
