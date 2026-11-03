// Test di accettazione del parser fatture Amazon.
// Uso:  npm i pdfjs-dist@3.11.174   poi   node tests/run_tests.js [percorso/parser.js]
// Confronta il parser con i risultati attesi in fixtures/expected (verificati a mano contro le fatture reali).
const fs = require("fs"), path = require("path");
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
const parserPath = path.resolve(process.argv[2] || path.join(__dirname, "../reference/parser.js"));
const { parseInvoice } = require(parserPath);
const FIX = path.join(__dirname, "../fixtures");

async function extract(file) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    pages.push(tc.items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5] })));
  }
  return pages;
}
const iso = d => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
const near = (a, b) => (typeof a === "number" && typeof b === "number") ? Math.abs(a - b) < 0.005 : a === b;

(async () => {
  let ok = 0, ko = 0;
  for (const f of fs.readdirSync(path.join(FIX, "pdf")).sort()) {
    const r = parseInvoice(await extract(path.join(FIX, "pdf", f)), f);
    const exp = JSON.parse(fs.readFileSync(path.join(FIX, "expected", r.numero + ".json"), "utf8"));
    const err = [];
    for (const k of ["numero", "template", "tipoDoc", "rifNotaCredito", "ds", "importoDovuto", "sommaTotale", "sommaAvere"])
      if (!near(r[k], exp[k])) err.push(`${k}: ${r[k]} != ${exp[k]}`);
    for (const k of ["dataFattura", "periodoDa", "periodoA"]) if (iso(r[k]) !== exp[k]) err.push(`${k}: ${iso(r[k])} != ${exp[k]}`);
    if (r.righe.length !== exp.righe.length) err.push(`righe: ${r.righe.length} != ${exp.righe.length}`);
    else r.righe.forEach((x, i) => {
      const e = exp.righe[i];
      for (const k of Object.keys(e)) { const v = k === "Data" ? iso(x[k]) : x[k]; if (!near(v, e[k])) err.push(`riga ${i + 1} ${k}: ${v} != ${e[k]}`); }
    });
    if (err.length) { ko++; console.log("KO", f, "\n   " + err.slice(0, 8).join("\n   ")); } else { ok++; console.log("OK", f, `(${r.righe.length} righe)`); }
  }
  console.log(`\n${ok} OK, ${ko} KO`); process.exit(ko ? 1 : 0);
})();
