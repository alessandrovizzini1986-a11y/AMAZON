// Copia il worker di pdf.js in public/ (servito come /pdf.worker.min.js), allineato alla versione installata.
import fs from "node:fs";
import path from "node:path";
const src = path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.min.js");
if (fs.existsSync(src)) {
  fs.mkdirSync(path.join(process.cwd(), "public"), { recursive: true });
  fs.copyFileSync(src, path.join(process.cwd(), "public", "pdf.worker.min.js"));
}
