/**
 * Anagrafica CDL (DB_CDL_base_MMAA_AmazonGLS_BO.xlsx, foglio "SIC Amazon TR",
 * intestazione in riga 2, data di riferimento in A1). Colonne per intestazione.
 */
import { at, text, type Cell, type SheetGrid } from "@/domain/presenze/grid";

export type RigaCDL = {
  cf: string; cognome: string; nome: string; station: string; contratto: string; pctPt: number | null; hSettim: number | null;
  ggLavorativi: number | null; tipologiaPt: string; rlm: number | null; edr: number | null; cdl: number; savingFeGg: number | null; savingRolH: number | null;
  savingExfH: number | null; costoFestNonGodutaGg: number | null; straoForfait: number | null;
};

const num = (v: Cell): number | null => (typeof v === "number" ? v : v === null || v === "" ? null : Number.isFinite(Number(String(v).replace(",", "."))) ? Number(String(v).replace(",", ".")) : null);
const str = (v: Cell) => (v === null ? "" : text(v).trim());

/** CF normalizzato: maiuscolo, senza spazi. */
export const normCf = (cf: string) => cf.replace(/\s+/g, "").toUpperCase();

export const FOGLIO_CDL = "SIC Amazon TR";

export function isAnagraficaCDL(sheets: SheetGrid[]) {
  return sheets.some((s) => s.name.trim().toLowerCase() === FOGLIO_CDL.toLowerCase());
}

/** `foglio`: "SIC Amazon TR" (Amazon, default) o "SIC GLS BO" (GLS Castel Maggiore). */
export function leggiAnagraficaCDL(sheets: SheetGrid[], foglio: string = FOGLIO_CDL): { meseVersione: string | null; righe: RigaCDL[]; scartate: number } {
  const ws = sheets.find((s) => s.name.trim().toLowerCase() === foglio.toLowerCase());
  if (!ws) throw new Error(`foglio "${foglio}" non trovato`);
  const a1 = at(ws, 0, 0);
  const meseVersione = a1 instanceof Date ? a1.toISOString().slice(0, 7) : null;
  const hr = [0, 1, 2, 3].find((r) => (ws.rows[r] ?? []).some((v) => str(v).toUpperCase() === "CODICE FISCALE"));
  if (hr === undefined) throw new Error('intestazione con "CODICE FISCALE" non trovata nelle prime righe');
  const hdr = (ws.rows[hr] ?? []).map((v) => str(v));
  const col = (nome: string, ...alt: string[]) => {
    for (const n of [nome, ...alt]) { const i = hdr.findIndex((h) => h.toLowerCase() === n.toLowerCase()); if (i >= 0) return i; }
    return -1;
  };
  const c = {
    cf: col("CODICE FISCALE"), cognome: col("COGNOME"), nome: col("NOME"), contratto: col("CONTRATTO"), pct: col("% PT"), h: col("h Settim."), gg: col("GG LAVORATIVI"),
    tip: col("Tipologia PT"), st: col("PLANT/STATION/PV"), rlm: col("RLM"), edr: col("E.D.R. Ccnl"), cdl: col("CDL"), sfe: col("Saving FE"), srol: col("Saving ROL"),
    sexf: col("Saving EXF"), fest: col("Costo festività (Non goduta)"), forf: col("Strao a forfait"),
  };
  const mancanti = Object.entries({ "CODICE FISCALE": c.cf, COGNOME: c.cognome, NOME: c.nome, "PLANT/STATION/PV": c.st, CDL: c.cdl }).filter(([, i]) => i < 0).map(([n]) => n);
  if (mancanti.length) throw new Error(`nell'anagrafica mancano le colonne ${mancanti.join(", ")}`);
  const righe: RigaCDL[] = [];
  let scartate = 0;
  for (let r = hr + 1; r < ws.rows.length; r++) {
    const cf = normCf(str(at(ws, r, c.cf)));
    if (!cf) continue;
    const cdl = num(at(ws, r, c.cdl));
    if (cdl === null) { scartate++; continue; }
    const g = (i: number) => (i >= 0 ? num(at(ws, r, i)) : null);
    righe.push({
      cf, cognome: str(at(ws, r, c.cognome)), nome: str(at(ws, r, c.nome)), station: str(at(ws, r, c.st)).toUpperCase(), contratto: c.contratto >= 0 ? str(at(ws, r, c.contratto)) : "",
      pctPt: g(c.pct), hSettim: g(c.h), ggLavorativi: g(c.gg), tipologiaPt: c.tip >= 0 ? str(at(ws, r, c.tip)) : "", rlm: g(c.rlm), edr: g(c.edr), cdl,
      savingFeGg: g(c.sfe), savingRolH: g(c.srol), savingExfH: g(c.sexf), costoFestNonGodutaGg: g(c.fest), straoForfait: g(c.forf),
    });
  }
  return { meseVersione, righe, scartate };
}

export type RiepilogoCDL = { teste: number; cdl: number; perStation: Record<string, { teste: number; cdl: number }> };

export function riepilogoCDL(righe: RigaCDL[]): RiepilogoCDL {
  const perStation: RiepilogoCDL["perStation"] = {};
  for (const r of righe) { const s = (perStation[r.station || "—"] ??= { teste: 0, cdl: 0 }); s.teste++; s.cdl += r.cdl; }
  for (const s of Object.values(perStation)) s.cdl = Math.round(s.cdl * 100) / 100;
  return { teste: righe.length, cdl: Math.round(righe.reduce((a, r) => a + r.cdl, 0) * 100) / 100, perStation };
}

/** Differenze con la versione precedente: entrati, usciti, CDL o station cambiati. */
export function differenzeCDL(prima: RigaCDL[], dopo: RigaCDL[]) {
  const p = new Map(prima.map((r) => [r.cf, r]));
  const d = new Map(dopo.map((r) => [r.cf, r]));
  const entrati = dopo.filter((r) => !p.has(r.cf));
  const usciti = prima.filter((r) => !d.has(r.cf));
  const cambiati = dopo.filter((r) => p.has(r.cf) && (Math.abs(p.get(r.cf)!.cdl - r.cdl) > 0.01 || p.get(r.cf)!.station !== r.station))
    .map((r) => ({ cf: r.cf, nome: `${r.cognome} ${r.nome}`, prima: { cdl: p.get(r.cf)!.cdl, station: p.get(r.cf)!.station }, dopo: { cdl: r.cdl, station: r.station } }));
  return { entrati, usciti, cambiati };
}

/**
 * Join per CF: esatto, poi con O↔0 nell'ultimo carattere (trappola nota:
 * un CF del tracking finisce con 0, in anagrafica con O). Restituisce la riga e se è stata corretta.
 */
export function trovaCDL(cf: string, indice: Map<string, RigaCDL>): { riga: RigaCDL; corretto: boolean } | null {
  const k = normCf(cf);
  const x = indice.get(k);
  if (x) return { riga: x, corretto: false };
  const ult = k.slice(-1);
  const alt = ult === "0" ? k.slice(0, -1) + "O" : ult === "O" ? k.slice(0, -1) + "0" : null;
  const y = alt ? indice.get(alt) : undefined;
  return y ? { riga: y, corretto: true } : null;
}
