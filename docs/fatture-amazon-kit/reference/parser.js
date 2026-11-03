// Parser fatture Amazon DSP — logica condivisa pagina web / test Node.
// Input: array di pagine, ogni pagina = array di {str, x, y} (items pdf.js). Output: oggetto fattura.
(function (root) {
  const RE_NUM = "-?\\s?[\\d.]*\\d,\\d{2}";
  const RE_A = new RegExp("^(\\d{2}/\\d{2}/\\d{4})\\s+(.+?)\\s+(-?\\d+)\\s+(" + RE_NUM + ")\\s+VAT\\s*(\\d+)\\s+(\\d+)%\\s+(" + RE_NUM + ")\\s+(" + RE_NUM + ")\\s*$");
  const RE_B = new RegExp("^(\\d{2}/\\d{2}/\\d{4})\\s+(\\d+)\\s+(.+?)\\s+(\\d+)\\s+(\\d+)%\\s+(-?\\d+)\\s+(" + RE_NUM + ")\\s+(" + RE_NUM + ")\\s*$");
  const RE_DATE_ONLY = /^\d{2}\/\d{2}\/\d{4}$/;

  function toNum(s) { return parseFloat(s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".")); }
  function r2(x) { return Math.round(x * 100) / 100; }

  // Ricostruisce le righe di testo da items pdf.js (raggruppa per y, ordina per x).
  function itemsToLines(items) {
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const y = Math.round(it.y);
      let row = rows.find(r => Math.abs(r.y - y) <= 2);
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push(it);
    }
    rows.sort((a, b) => b.y - a.y);
    return rows.map(r => r.items.sort((a, b) => a.x - b.x).map(i => i.str.trim()).join(" ").replace(/\s+/g, " ").trim());
  }

  function parseDate(s, fmt) {
    const [a, b, c] = s.split("/").map(Number);
    return fmt === "dmy" ? new Date(Date.UTC(c, b - 1, a)) : new Date(Date.UTC(c, a - 1, b));
  }
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 86400000 + 1) / 7);
  }
  function amazonWeek(d) { const t = new Date(d); t.setUTCDate(t.getUTCDate() + 1); return isoWeek(t); }

  function parseInvoice(pages, filename) {
    const lines = [];
    for (const p of pages) lines.push(...itemsToLines(p));
    const text = lines.join("\n");
    const inv = text.match(/(INV-[A-Z0-9]+-\d+)/);
    const numero = inv ? inv[1] : null;
    const template = /Dettagli fattura/.test(text) ? "A" : (/Appendice/.test(text) ? "B" : "?");
    const tipoDoc = /^\s*Nota di credito/.test(text) ? "Nota di credito" : "Fattura";
    const rnc = text.match(/Credit Note for (INV-[A-Z0-9]+-\d+)/);
    const fmt = template === "A" ? "dmy" : "mdy";

    let ds = null;
    for (let i = 0; i < lines.length; i++) {
      if ((template === "A" && /Indirizzo di consegna/.test(lines[i])) || (template !== "A" && /^Fattura a/.test(lines[i]))) {
        const w = lines[i + 1].trim().split(" "); ds = w[w.length - 1]; break;
      }
    }
    const per = text.match(/(\d{2}\/\d{2}\/\d{4}) a (\d{2}\/\d{2}\/\d{4})/);
    let df = text.match(/Data fattura:?\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/);
    if (!df) df = text.match(/Numero di partita IVA: IT\d+\s+(\d{2}\/\d{2}\/\d{4})/);
    let tot = text.match(new RegExp("Importo dovuto:?\\s*(" + RE_NUM + ")")) || text.match(new RegExp("Importo\\s+(" + RE_NUM + ")\\s*€"));

    const righe = [];
    if (template === "A") {
      let inDet = false, cur = null;
      for (const l of lines) {
        const s = l.trim();
        if (/^Dettagli fattura/.test(s)) { inDet = true; continue; }
        if (!inDet) continue;
        if (/^Fattura emessa/.test(s)) break;
        const m = s.match(RE_A);
        if (m) {
          cur = { Data: parseDate(m[1], "dmy"), Descrizione: m[2].trim(), Quantita: parseInt(m[3]), Prezzo: toNum(m[4]),
            Tasse: "VAT " + m[5], Rateo: parseInt(m[6]) / 100, ImportoIVA: toNum(m[7]), Totale: toNum(m[8]) };
          righe.push(cur); continue;
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
        if (!m) { if (righe.length && !/^Data /.test(s)) righe[righe.length - 1].Descrizione += " " + s; continue; }
        const imp = toNum(m[8]); const iva = r2(imp * parseInt(m[5]) / 100);
        righe.push({ Data: parseDate(m[1], "mdy"), Descrizione: m[3].trim(), Quantita: parseInt(m[6]), Prezzo: toNum(m[7]),
          Tasse: "VAT " + m[5], Rateo: parseInt(m[5]) / 100, ImportoIVA: iva, Totale: r2(imp + iva) });
      }
    }
    for (const r of righe) {
      r.AVERE = r2(r.Totale - r.ImportoIVA); r.WEEK = amazonWeek(r.Data); r.MESE = r.Data.getUTCMonth() + 1;
      r.ANNO = r.Data.getUTCFullYear(); r.Numero = numero; r.DS = ds;
    }
    const sommaTot = r2(righe.reduce((a, r) => a + r.Totale, 0));
    const sommaAvere = r2(righe.reduce((a, r) => a + r.AVERE, 0));
    const dovuto = tot ? toNum(tot[1]) : null;
    return { file: filename, numero, template, tipoDoc, rifNotaCredito: rnc ? rnc[1] : null, ds,
      dataFattura: df ? parseDate(df[1], fmt) : null, periodoDa: per ? parseDate(per[1], fmt) : null,
      periodoA: per ? parseDate(per[2], fmt) : null, importoDovuto: dovuto, righe, sommaTotale: sommaTot,
      sommaAvere, delta: dovuto == null ? null : r2(dovuto - sommaTot) };
  }

  const api = { parseInvoice, itemsToLines, amazonWeek };
  if (typeof module !== "undefined") module.exports = api; else root.FattureParser = api;
})(typeof window !== "undefined" ? window : globalThis);
