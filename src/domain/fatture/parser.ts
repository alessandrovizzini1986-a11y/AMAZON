/**
 * Parser fatture Amazon DSP: porting 1:1 di docs/fatture-amazon-kit/reference/parser.js
 * (logica verificata riga per riga su 79 fatture reali). Non cambiare la logica
 * senza aggiornare il riferimento e le fixture in tests/fixtures/fatture-amazon.
 *
 * Input: pagine pdf.js, ogni pagina = elenco di { str, x, y }. Output: fattura.
 */

export type ItemPdf = { str: string; x: number; y: number };

export type RigaFattura = {
  Data: Date;
  Descrizione: string;
  Quantita: number;
  Prezzo: number;
  Tasse: string; // "VAT 22"
  Rateo: number; // 0.22
  ImportoIVA: number;
  Totale: number;
  AVERE: number;
  WEEK: number;
  MESE: number;
  ANNO: number;
  Numero: string | null;
  DS: string | null;
};

export type Fattura = {
  file: string;
  numero: string | null;
  template: "A" | "B" | "?";
  tipoDoc: "Fattura" | "Nota di credito";
  rifNotaCredito: string | null;
  ds: string | null;
  dataFattura: Date | null;
  periodoDa: Date | null;
  periodoA: Date | null;
  importoDovuto: number | null;
  righe: RigaFattura[];
  sommaTotale: number;
  sommaAvere: number;
  delta: number | null;
};

const RE_NUM = "-?\\s?[\\d.]*\\d,\\d{2}";
const RE_A = new RegExp("^(\\d{2}/\\d{2}/\\d{4})\\s+(.+?)\\s+(-?\\d+)\\s+(" + RE_NUM + ")\\s+VAT\\s*(\\d+)\\s+(\\d+)%\\s+(" + RE_NUM + ")\\s+(" + RE_NUM + ")\\s*$");
const RE_B = new RegExp("^(\\d{2}/\\d{2}/\\d{4})\\s+(\\d+)\\s+(.+?)\\s+(\\d+)\\s+(\\d+)%\\s+(-?\\d+)\\s+(" + RE_NUM + ")\\s+(" + RE_NUM + ")\\s*$");
const RE_DATE_ONLY = /^\d{2}\/\d{2}\/\d{4}$/;

function toNum(s: string): number {
  return parseFloat(s.replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
}
function r2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Ricostruisce le righe di testo dagli item pdf.js (raggruppa per y, ordina per x). */
export function itemsToLines(items: ItemPdf[]): string[] {
  const rows: { y: number; items: ItemPdf[] }[] = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const y = Math.round(it.y);
    let row = rows.find((r) => Math.abs(r.y - y) <= 2);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push(it);
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => r.items.sort((a, b) => a.x - b.x).map((i) => i.str.trim()).join(" ").replace(/\s+/g, " ").trim());
}

function parseDate(s: string, fmt: "dmy" | "mdy"): Date {
  const [a, b, c] = s.split("/").map(Number);
  return fmt === "dmy" ? new Date(Date.UTC(c, b - 1, a)) : new Date(Date.UTC(c, a - 1, b));
}

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
}

/** Settimana Amazon (domenica–sabato) = settimana ISO di (data + 1 giorno). */
export function amazonWeek(d: Date): number {
  const t = new Date(d);
  t.setUTCDate(t.getUTCDate() + 1);
  return isoWeek(t);
}

export function parseInvoice(pages: ItemPdf[][], filename: string): Fattura {
  const lines: string[] = [];
  for (const p of pages) lines.push(...itemsToLines(p));
  const text = lines.join("\n");
  const inv = text.match(/(INV-[A-Z0-9]+-\d+)/);
  const numero = inv ? inv[1] : null;
  const template: Fattura["template"] = /Dettagli fattura/.test(text) ? "A" : /Appendice/.test(text) ? "B" : "?";
  const tipoDoc: Fattura["tipoDoc"] = /^\s*Nota di credito/.test(text) ? "Nota di credito" : "Fattura";
  const rnc = text.match(/Credit Note for (INV-[A-Z0-9]+-\d+)/);
  const fmt = template === "A" ? "dmy" : "mdy";

  let ds: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    if ((template === "A" && /Indirizzo di consegna/.test(lines[i])) || (template !== "A" && /^Fattura a/.test(lines[i]))) {
      const w = (lines[i + 1] ?? "").trim().split(" ");
      ds = w[w.length - 1];
      break;
    }
  }
  const per = text.match(/(\d{2}\/\d{2}\/\d{4}) a (\d{2}\/\d{2}\/\d{4})/);
  let df = text.match(/Data fattura:?\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/);
  if (!df) df = text.match(/Numero di partita IVA: IT\d+\s+(\d{2}\/\d{2}\/\d{4})/);
  const tot = text.match(new RegExp("Importo dovuto:?\\s*(" + RE_NUM + ")")) || text.match(new RegExp("Importo\\s+(" + RE_NUM + ")\\s*€"));

  type Parziale = Omit<RigaFattura, "AVERE" | "WEEK" | "MESE" | "ANNO" | "Numero" | "DS">;
  const righe: Parziale[] = [];
  if (template === "A") {
    let inDet = false;
    let cur: Parziale | null = null;
    for (const l of lines) {
      const s = l.trim();
      if (/^Dettagli fattura/.test(s)) { inDet = true; continue; }
      if (!inDet) continue;
      if (/^Fattura emessa/.test(s)) break;
      const m = s.match(RE_A);
      if (m) {
        cur = { Data: parseDate(m[1], "dmy"), Descrizione: m[2].trim(), Quantita: parseInt(m[3]), Prezzo: toNum(m[4]), Tasse: "VAT " + m[5], Rateo: parseInt(m[6]) / 100, ImportoIVA: toNum(m[7]), Totale: toNum(m[8]) };
        righe.push(cur);
        continue;
      }
      if (/^Data /.test(s) || s === "IVA" || RE_DATE_ONLY.test(s) || /^INV-/.test(s) || /^Pagina/.test(s) || /^Questo documento/.test(s) || /^Disclaimer/.test(s)) continue;
      if (cur) cur.Descrizione = (cur.Descrizione + " " + s).trim();
    }
  } else if (template === "B") {
    let inApp = false;
    for (const l of lines) {
      const s = l.trim();
      if (/^Appendice/.test(s)) { inApp = true; continue; }
      if (!inApp) continue;
      if (/^Totale parziale/.test(s)) break;
      const m = s.match(RE_B);
      if (!m) {
        if (righe.length && !/^Data /.test(s)) righe[righe.length - 1].Descrizione += " " + s;
        continue;
      }
      const imp = toNum(m[8]);
      const iva = r2((imp * parseInt(m[5])) / 100);
      righe.push({ Data: parseDate(m[1], "mdy"), Descrizione: m[3].trim(), Quantita: parseInt(m[6]), Prezzo: toNum(m[7]), Tasse: "VAT " + m[5], Rateo: parseInt(m[5]) / 100, ImportoIVA: iva, Totale: r2(imp + iva) });
    }
  }
  const complete: RigaFattura[] = righe.map((r) => ({
    ...r, AVERE: r2(r.Totale - r.ImportoIVA), WEEK: amazonWeek(r.Data), MESE: r.Data.getUTCMonth() + 1, ANNO: r.Data.getUTCFullYear(), Numero: numero, DS: ds,
  }));
  const sommaTot = r2(complete.reduce((a, r) => a + r.Totale, 0));
  const sommaAvere = r2(complete.reduce((a, r) => a + r.AVERE, 0));
  const dovuto = tot ? toNum(tot[1]) : null;
  return {
    file: filename, numero, template, tipoDoc, rifNotaCredito: rnc ? rnc[1] : null, ds,
    dataFattura: df ? parseDate(df[1], fmt) : null, periodoDa: per ? parseDate(per[1], fmt) : null, periodoA: per ? parseDate(per[2], fmt) : null,
    importoDovuto: dovuto, righe: complete, sommaTotale: sommaTot, sommaAvere, delta: dovuto == null ? null : r2(dovuto - sommaTot),
  };
}
