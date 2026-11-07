/** Rigenera content/vademecum/18-glossario.md da src/content/glossario.ts: npx tsx scripts/glossario-md.mts */
import { writeFileSync } from "node:fs";
import { GLOSSARIO } from "../src/content/glossario";

export function glossarioMd(oggi: string) {
  const temi = [...new Set(GLOSSARIO.map((g) => g.tema))];
  const righe = [`---`, `title: "Glossario"`, `order: 18`, `category: "Base"`, `updated: "${oggi}"`, `---`, ``,
    `Le sigle e le parole che si incontrano nel sito e nei file. Nel sito, le sigle sottolineate a puntini mostrano la spiegazione al passaggio del mouse e portano qui.`, ``];
  for (const t of temi) {
    righe.push(`### ${t}`, ``, `| Sigla | Significato | In pratica |`, `|---|---|---|`);
    for (const g of GLOSSARIO.filter((x) => x.tema === t)) righe.push(`| **${g.sigla}** | ${g.nome} | ${g.spiega.replace(/\|/g, "\\|")} |`);
    righe.push(``);
  }
  return righe.join("\n");
}

if (process.argv[1]?.endsWith("glossario-md.mts")) {
  writeFileSync("content/vademecum/18-glossario.md", glossarioMd(new Date().toISOString().slice(0, 10)));
  console.log("scritto content/vademecum/18-glossario.md");
}
