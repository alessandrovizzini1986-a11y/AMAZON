/** Testo per Teams: una tabella per station con i totali e i 3 avvisi principali. */
export type RigaTeams = { station: string; std: number | null; stdTeste: number | null; sic: number | null; sicTeste: number | null; avvisi: { peso: number; testo: string }[] };

const eur = (v: number) => v.toLocaleString("it-IT", { maximumFractionDigits: 0 });

export function testoTeams(mese: string, righe: RigaTeams[], note: string[] = []): string {
  const [a, m] = mese.split("-");
  const mesi = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  const tot = (k: "std" | "sic") => righe.reduce((s, r) => s + (r[k] ?? 0), 0);
  const out: string[] = [`**Costi del personale — ${mesi[Number(m) - 1]} ${a}**`, ""];
  out.push("| Station | STD competenza € | Teste STD | SIC busta 27 € | Teste SIC | Avvisi |", "|---|---:|---:|---:|---:|---|");
  for (const r of righe) {
    const av = [...r.avvisi].sort((x, y) => y.peso - x.peso).slice(0, 3).map((x) => x.testo).join("; ") || "—";
    out.push(`| ${r.station} | ${r.std === null ? "—" : eur(r.std)} | ${r.stdTeste ?? "—"} | ${r.sic === null ? "—" : eur(r.sic)} | ${r.sicTeste ?? "—"} | ${av} |`);
  }
  out.push(`| **Totale** | **${eur(tot("std"))}** | ${righe.reduce((s, r) => s + (r.stdTeste ?? 0), 0)} | **${eur(tot("sic"))}** | ${righe.reduce((s, r) => s + (r.sicTeste ?? 0), 0)} | |`);
  if (note.length) out.push("", ...note.map((n) => `- ${n}`));
  return out.join("\n");
}
