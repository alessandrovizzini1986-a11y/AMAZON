/**
 * Canone stimato dei mezzi attivi senza canone (in attesa della prima fattura): mediana dei mezzi non dismessi
 * con canone della stessa società, modello e tipo contratto; se non ce ne sono, stessa società e tipo.
 * I sostitutivi non si pagano: mai stimati.
 */
export type MezzoCanone = { targa: string; stato: string; societa: string | null; modello: string; tipo: string | null; canone: number | null };
export type StimaCanone = { targa: string; societa: string | null; modello: string; tipo: string | null; canone: number | null; base: string };

const mediana = (x: number[]) => { const s = [...x].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function stimaCanone(mezzi: MezzoCanone[]): StimaCanone[] {
  const vivi = mezzi.filter((m) => m.stato !== "DISMESSO");
  const conCanone = vivi.filter((m) => m.stato !== "SOSTITUTIVO" && (m.canone ?? 0) > 0);
  const out: StimaCanone[] = [];
  for (const m of vivi) {
    if (m.stato === "SOSTITUTIVO" || m.stato === "UFFICIO" || (m.canone ?? 0) > 0) continue;
    const simili = conCanone.filter((c) => c.societa === m.societa && c.modello === m.modello && c.tipo === m.tipo);
    const simili2 = simili.length ? simili : conCanone.filter((c) => c.societa === m.societa && c.tipo === m.tipo);
    if (!simili2.length) { out.push({ targa: m.targa, societa: m.societa, modello: m.modello, tipo: m.tipo, canone: null, base: "nessun mezzo simile con canone" }); continue; }
    const canone = Math.round(mediana(simili2.map((c) => c.canone!)) * 100) / 100;
    out.push({ targa: m.targa, societa: m.societa, modello: m.modello, tipo: m.tipo, canone, base: `mediana di ${simili2.length} mezzi ${m.societa} ${simili.length ? m.modello + " " : ""}${m.tipo ?? ""}`.trim() });
  }
  return out;
}
