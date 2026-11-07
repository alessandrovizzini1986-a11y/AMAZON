/**
 * Consuntivo contabile (file "consuntivo_costi_fatturato_AAAA.xlsx", foglio SOLITO): dai costi effettivi
 * del CDC 5569 prende carburante, pedaggi e parcheggi ("AFFITTI AMAZON") per mese di registrazione e DS (colonna Zona).
 * Nei Rimborsi, dove c'è il consuntivo di un mese e di una voce, vale lui.
 */
type Cella = string | number | boolean | Date | null | undefined;
export type RigaConsuntivo = { anno: number; mese: number; ds: string; voce: "CARBURANTE" | "PEDAGGI" | "PARCHEGGI"; importo: number };

const MESI = ["GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO", "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE"];
export const VOCI_CONSUNTIVO: Record<string, RigaConsuntivo["voce"]> = { CARBURANTE: "CARBURANTE", PEDAGGI: "PEDAGGI", "AFFITTI AMAZON": "PARCHEGGI" };
const t = (v: Cella) => (v === null || v === undefined ? "" : String(v).trim());
const DS = /^D[A-Z]{2}\d$/;

/** Anno dal nome del file (…_2025.xlsx): l'ultimo anno plausibile (2020 → anno prossimo), altrimenti null. */
export function annoDaNome(nome: string, oggi = new Date()): number | null {
  const anni = [...nome.matchAll(/(?<!\d)(20\d\d)(?!\d)/g)].map((m) => Number(m[1])).filter((a) => a >= 2020 && a <= oggi.getFullYear() + 1);
  return anni.length ? anni[anni.length - 1] : null;
}

export function leggiConsuntivo(m: Cella[][], anno: number, cdc = "5569"): { righe: RigaConsuntivo[]; scartate: number } {
  const hr = m.findIndex((r) => r.some((v) => t(v) === "Tipologia Costo") && r.some((v) => t(v) === "Costo Effettivo"));
  if (hr < 0) throw new Error('non trovo le colonne "Tipologia Costo" e "Costo Effettivo": serve il foglio SOLITO del consuntivo');
  const h = m[hr].map(t);
  const c = { mese: h.indexOf("Mese"), tip: h.indexOf("Tipologia Costo"), cdc: h.indexOf("CDC"), zona: h.indexOf("Zona"), costo: h.indexOf("Costo Effettivo") };
  if (Object.values(c).some((i) => i < 0)) throw new Error("mancano colonne (Mese, Tipologia Costo, CDC, Zona, Costo Effettivo)");
  const somma = new Map<string, number>();
  let scartate = 0;
  for (const r of m.slice(hr + 1)) {
    const voce = VOCI_CONSUNTIVO[t(r[c.tip]).toUpperCase()];
    const mi = MESI.indexOf(t(r[c.mese]).toUpperCase());
    if (!voce || mi < 0 || !t(r[c.cdc]).startsWith(cdc)) continue;
    const ds = t(r[c.zona]).toUpperCase(), v = r[c.costo];
    if (!DS.test(ds) || typeof v !== "number") { scartate++; continue; }
    const k = `${mi + 1}|${ds}|${voce}`;
    somma.set(k, (somma.get(k) ?? 0) + v);
  }
  const righe = [...somma].map(([k, v]) => { const [mese, ds, voce] = k.split("|"); return { anno, mese: Number(mese), ds, voce: voce as RigaConsuntivo["voce"], importo: Math.round(v * 100) / 100 }; })
    .filter((r) => Math.abs(r.importo) > 0.004).sort((a, b) => a.mese - b.mese || a.voce.localeCompare(b.voce) || a.ds.localeCompare(b.ds));
  return { righe, scartate };
}

/** Totali per mese e voce (per l'anteprima). */
export function totaliMeseVoce(r: Pick<RigaConsuntivo, "mese" | "voce" | "importo">[]) {
  const o: Record<string, number> = {};
  for (const x of r) { const k = `${x.mese}|${x.voce}`; o[k] = Math.round(((o[k] ?? 0) + x.importo) * 100) / 100; }
  return o;
}
