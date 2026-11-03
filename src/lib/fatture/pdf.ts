/**
 * Lettura nel browser dei PDF delle fatture con pdf.js (il PDF non lascia il PC)
 * e apertura degli zip prodotti dal preferito del browser.
 */
import JSZip from "jszip";
import type { ItemPdf } from "@/domain/fatture/parser";
import { sha256 } from "@/lib/presenze/riconosci";

type PdfJs = typeof import("pdfjs-dist");
let pdfjs: Promise<PdfJs> | null = null;
function carica(): Promise<PdfJs> {
  pdfjs ??= import("pdfjs-dist/legacy/build/pdf").then((m) => {
    const lib = m as unknown as PdfJs;
    lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
    return lib;
  });
  return pdfjs;
}

export async function pagineDaPdf(data: ArrayBuffer): Promise<ItemPdf[][]> {
  const lib = await carica();
  const doc = await lib.getDocument({ data: new Uint8Array(data), verbosity: 0 }).promise;
  const out: ItemPdf[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out.push(tc.items.map((x) => { const it = x as { str?: string; transform?: number[] }; return { str: it.str ?? "", x: it.transform?.[4] ?? 0, y: it.transform?.[5] ?? 0 }; }));
  }
  await doc.destroy();
  return out;
}

export type FileCaricato = { nome: string; data: ArrayBuffer; sha256: string; errore?: string };

/** File trascinati → elenco piatto di PDF (gli zip vengono aperti; ogni voce resta nel report). */
export async function espandiFile(files: File[]): Promise<FileCaricato[]> {
  const out: FileCaricato[] = [];
  for (const f of files) {
    const data = await f.arrayBuffer();
    const head = new Uint8Array(data.slice(0, 4));
    const isZip = head[0] === 0x50 && head[1] === 0x4b;
    if (isZip && /\.zip$/i.test(f.name)) {
      try {
        const zip = await JSZip.loadAsync(data);
        const voci = Object.values(zip.files).filter((z) => !z.dir && !/(^|\/)(__MACOSX|\.)/.test(z.name));
        for (const z of voci) {
          const nome = z.name.split("/").pop()!;
          const d = await z.async("arraybuffer");
          out.push(/\.pdf$/i.test(nome) ? { nome, data: d, sha256: await sha256(d) } : { nome, data: d, sha256: await sha256(d), errore: "nello zip non è un PDF" });
        }
      } catch {
        out.push({ nome: f.name, data, sha256: await sha256(data), errore: "zip illeggibile" });
      }
      continue;
    }
    const isPdf = new TextDecoder().decode(head) === "%PDF";
    out.push(isPdf ? { nome: f.name, data, sha256: await sha256(data) } : { nome: f.name, data, sha256: await sha256(data), errore: "non è un PDF" });
  }
  return out;
}
