/**
 * Lettura in streaming di UN foglio di un .xlsx grande (es. AGGREGATO, ~37 MB
 * compressi, Power Pivot) direttamente dall'XML dentro lo zip: niente ExcelJS,
 * niente modello in memoria del workbook. L'XML del foglio viene decompresso
 * a pezzi e le righe <row> vengono elaborate man mano.
 * Funziona nel browser (anche in un Web Worker) e in Node (test).
 */
import JSZip from "jszip";

export type CellaX = string | number | boolean | null;

const decodeXml = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    if (k === "amp") return "&";
    return String.fromCodePoint(k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });

const testoT = (xml: string) => {
  let out = "";
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) out += m[1] ?? "";
  return decodeXml(out).replace(/_x000D_/g, "");
};

/** Decomprime un'entry dello zip a pezzi e chiama onTag per ogni elemento <tag>…</tag> completo. */
async function streamTag(zip: JSZip, entry: string, tag: string, onTag: (xml: string) => void, onProgress?: (byte: number) => void): Promise<void> {
  const f = zip.file(entry);
  if (!f) throw new Error(`voce ${entry} mancante nel file`);
  const close = `</${tag}>`;
  const open = new RegExp(`<${tag}[\\s>]`, "g");
  let buf = "";
  let letti = 0;
  const dec = new TextDecoder("utf-8");
  const elabora = (fine: boolean) => {
    let from = 0;
    for (;;) {
      open.lastIndex = from;
      const mo = open.exec(buf);
      if (!mo) break;
      const gt = buf.indexOf(">", mo.index);
      if (gt < 0) break; // tag di apertura non ancora completo
      if (buf[gt - 1] === "/") { from = gt + 1; continue; } // elemento vuoto autochiuso (<row r="5"/>)
      const end = buf.indexOf(close, gt);
      if (end < 0) break; // elemento non ancora completo: aspetta il pezzo successivo
      onTag(buf.slice(mo.index, end + close.length));
      from = end + close.length;
    }
    buf = fine ? "" : buf.slice(from);
  };
  await new Promise<void>((resolve, reject) => {
    // internalStream esiste in jszip 3 ma non è nei tipi pubblici
    type Stream = { on(ev: "data", cb: (c: Uint8Array) => void): Stream; on(ev: "error", cb: (e: unknown) => void): Stream; on(ev: "end", cb: () => void): Stream; resume(): void };
    const s = (f as unknown as { internalStream(t: "uint8array"): Stream }).internalStream("uint8array");
    s.on("data", (chunk: Uint8Array) => {
      letti += chunk.length;
      buf += dec.decode(chunk, { stream: true });
      elabora(false);
      onProgress?.(letti);
    });
    s.on("error", reject);
    s.on("end", () => {
      buf += dec.decode();
      elabora(true);
      resolve();
    });
    s.resume();
  });
}

/** Percorso dell'XML del foglio con quel nome (case-insensitive), o null. */
async function percorsoFoglio(zip: JSZip, nome: string): Promise<string | null> {
  const wb = await zip.file("xl/workbook.xml")?.async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!wb || !rels) throw new Error("non è un file Excel .xlsx valido");
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attr = m[1];
    const n = decodeXml(/\bname="([^"]*)"/.exec(attr)?.[1] ?? "");
    if (n.trim().toLowerCase() !== nome.trim().toLowerCase()) continue;
    const id = /\br:id="([^"]*)"/.exec(attr)?.[1];
    for (const r of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      if (/\bId="([^"]*)"/.exec(r[1])?.[1] !== id) continue;
      const t = /\bTarget="([^"]*)"/.exec(r[1])![1];
      return t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, "");
    }
  }
  return null;
}

export async function nomiFogli(zip: JSZip): Promise<string[]> {
  const wb = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
  return [...wb.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map((m) => decodeXml(m[1]));
}

const colIdx = (ref: string) => {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + c - 64;
  }
  return n - 1;
};

/**
 * Legge le righe del foglio `nome`. Riga 1 = intestazioni; `colonne` limita la
 * lettura alle intestazioni indicate (case-insensitive, trim) per risparmiare
 * memoria. Le celle numeriche restano numeri (date = seriale Excel).
 */
export async function leggiFoglio(
  data: ArrayBuffer | Uint8Array,
  nome: string,
  opz: {
    colonne?: string[]; onRiga?: (riga: Record<string, CellaX>, n: number) => void; onProgress?: (fase: string, byte: number) => void;
    /** riga di intestazione: la prima per cui restituisce true (default: la prima riga) */
    intestazione?: (celle: CellaX[]) => boolean;
    /** tutte le righe come elenco di celle per posizione (per i lettori a matrice); con questo onRiga non serve */
    onCelle?: (celle: CellaX[]) => void;
  } = {},
): Promise<{ intestazioni: string[]; righe: number; mancanti: string[]; rigaIntestazione: CellaX[] }> {
  const zip = await JSZip.loadAsync(data);
  const path = await percorsoFoglio(zip, nome);
  if (!path) throw new Error(`foglio "${nome}" non trovato (fogli: ${(await nomiFogli(zip)).join(", ")})`);
  const shared: string[] = [];
  if (zip.file("xl/sharedStrings.xml")) await streamTag(zip, "xl/sharedStrings.xml", "si", (x) => shared.push(testoT(x)), (b) => opz.onProgress?.("testi", b));

  let intest: string[] | null = null;
  let rigaInt: CellaX[] = [];
  let tenere: Map<number, string> | null = null;
  const mancanti: string[] = [];
  let n = 0;
  const valore = (attr: string, inner: string): CellaX => {
    const t = /\bt="([^"]+)"/.exec(attr)?.[1];
    if (t === "inlineStr") return testoT(inner);
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
    if (v === undefined) return null;
    if (t === "s") return shared[Number(v)] ?? null;
    if (t === "str" || t === "e") return decodeXml(v);
    if (t === "b") return v === "1";
    const x = Number(v);
    return Number.isFinite(x) ? x : decodeXml(v);
  };
  await streamTag(zip, path, "row", (rowXml) => {
    const celle: CellaX[] = [];
    let piena = false; // la riga ha almeno un valore (in qualsiasi colonna)
    for (const c of rowXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+)\d+"/.exec(c[1])?.[1];
      const i = ref ? colIdx(ref) : celle.length;
      if (tenere && !tenere.has(i)) {
        if (!piena && /<v>|<t[\s>]/.test(c[2] ?? "")) piena = true;
        continue;
      }
      celle[i] = valore(c[1], c[2] ?? "");
      if (celle[i] !== null && celle[i] !== "") piena = true;
    }
    if (opz.onCelle) { if (piena) { n++; opz.onCelle(Array.from(celle, (v) => v ?? null)); } return; }
    if (!intest) {
      if (opz.intestazione && !opz.intestazione(Array.from(celle, (v) => v ?? null))) return;
      rigaInt = Array.from(celle, (v) => v ?? null);
      intest = Array.from(celle, (v) => (v === null || v === undefined ? "" : String(v).trim()));
      if (opz.colonne) {
        tenere = new Map();
        for (const col of opz.colonne) {
          const i = intest.findIndex((h) => h.toLowerCase() === col.toLowerCase());
          if (i < 0) mancanti.push(col);
          else tenere.set(i, col);
        }
      }
      return;
    }
    const riga: Record<string, CellaX> = {};
    if (tenere) for (const [i, col] of tenere) riga[col] = celle[i] ?? null;
    else intest.forEach((h, i) => { if (h) riga[h] = celle[i] ?? null; });
    if (!piena) return;
    n++;
    opz.onRiga?.(riga, n);
  }, (b) => opz.onProgress?.("foglio", b));
  return { intestazioni: intest ?? [], righe: n, mancanti, rigaIntestazione: rigaInt };
}

/** Seriale Excel → data UTC (sistema 1900). */
export const dataDaSeriale = (x: number) => new Date(Date.UTC(1899, 11, 30) + Math.round(x * 86400000));

/** Nomi dei fogli di un .xlsx (senza leggerne il contenuto). */
export async function fogliDelFile(data: ArrayBuffer | Uint8Array): Promise<string[]> {
  return nomiFogli(await JSZip.loadAsync(data));
}

/** Un foglio come matrice di celle (righe non vuote, colonne per posizione), per i lettori a matrice. */
export async function matriceFoglio(data: ArrayBuffer | Uint8Array, nome: string): Promise<CellaX[][]> {
  const m: CellaX[][] = [];
  await leggiFoglio(data, nome, { onCelle: (c) => m.push(c) });
  return m;
}
