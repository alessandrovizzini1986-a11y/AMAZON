/**
 * File presenze GLS Castel Maggiore ("GLS_Castel_Maggiore_-_Presenze_<MESE>_<AAAA>_Delivery.xlsx"):
 * foglio "Anagrafica" (una riga per persona) e foglio del mese ("OTTOBRE", …) con la griglia persona × giorno:
 * per ogni persona una riga per voce (Ordinarie, Straordinari, FERIE, MALATTIA, Indennità Trasferta…).
 * Regole in docs/costi-kit/PROMPT_GLS_mensile.md.
 */
import { at, isoOf, num, text, type Cell, type SheetGrid } from "@/domain/presenze/grid";
import { normCf } from "@/domain/costi/anagrafica";

export const MESI_IT = ["GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO", "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE"];

/** Voci della griglia (come nel file; il lettore accetta maiuscole/minuscole diverse). */
export const VOCI_GLS = ["Ordinarie", "Notturno", "Straordinari notturni", "Straordinari", "FERIE", "ROL", "EXF", "PNR", "PERMESSO SINDACALE", "PERMESSO L.104", "DONAZIONE SANGUE", "PERMESSO VISITA MEDICA", "MALATTIA", "ALTRI GIUSTIFICATIVI", "Indennità Trasferta"] as const;
export type VoceGls = (typeof VOCI_GLS)[number];

export type PersonaAnagraficaGls = {
  cf: string; nome: string; cognome: string; ftPt: string; pct: number | null; hSettim: number | null; hGiorno: number | null;
  tipo: "SIC" | "STD" | ""; attivo: boolean; inizio: string | null; fine: string | null; mansione: string;
};
export type PersonaGrigliaGls = { cf: string; nome: string; mansione: string; voci: Partial<Record<VoceGls, Record<string, number>>> };
export type PresenzeGls = { mese: string; anagrafica: PersonaAnagraficaGls[]; griglia: PersonaGrigliaGls[]; giorni: string[]; foglio: string };

const s = (v: Cell) => text(v).trim();
const isoData = (v: Cell): string | null => {
  if (v instanceof Date) return isoOf(v);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s(v));
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s(v)) ? s(v).slice(0, 10) : null;
};
const numONull = (v: Cell) => (v === null || s(v) === "" ? null : num(v));
const voceDi = (v: string): VoceGls | null => VOCI_GLS.find((x) => x.toLowerCase() === v.trim().toLowerCase()) ?? null;

export const isPresenzeGls = (sheets: SheetGrid[]) => sheets.some((w) => w.name.trim().toLowerCase() === "anagrafica") && sheets.some((w) => MESI_IT.includes(w.name.trim().toUpperCase()));

export function leggiAnagraficaGls(sheets: SheetGrid[]): PersonaAnagraficaGls[] {
  const ws = sheets.find((w) => w.name.trim().toLowerCase() === "anagrafica");
  if (!ws) throw new Error('foglio "Anagrafica" non trovato');
  const hr = ws.rows.slice(0, 5).findIndex((r) => r.some((v) => s(v).toUpperCase() === "CODICE FISCALE"));
  if (hr < 0) throw new Error('nel foglio Anagrafica manca la colonna "CODICE FISCALE"');
  const h = ws.rows[hr].map((v) => s(v).toLowerCase());
  const c = (...n: string[]) => h.findIndex((x) => n.includes(x));
  const k = { nome: c("nome"), cognome: c("cognome"), cf: c("codice fiscale"), ftpt: c("ft / pt", "ft/pt"), pct: c("% contratto"), hs: c("qnt. hh settimanali"), hg: c("qnt. hh giorno"), tipo: c("sic/std"), stato: c("attivo/cessato"), ini: c("data inizio"), fine: c("data fine"), mans: c("mansione") };
  const manca = Object.entries(k).filter(([, i]) => i < 0).map(([n]) => n);
  if (manca.includes("cf") || manca.includes("tipo") || manca.includes("stato")) throw new Error(`nel foglio Anagrafica mancano colonne (${manca.join(", ")})`);
  const out: PersonaAnagraficaGls[] = [];
  for (let r = hr + 1; r < ws.rows.length; r++) {
    const cf = normCf(s(at(ws, r, k.cf)));
    if (!cf) continue;
    const g = (i: number) => (i >= 0 ? at(ws, r, i) : null);
    const tipo = s(g(k.tipo)).toUpperCase();
    const pct = numONull(g(k.pct));
    out.push({
      cf, nome: s(g(k.nome)), cognome: s(g(k.cognome)), ftPt: s(g(k.ftpt)).toUpperCase(), pct: pct === null ? null : pct > 1 ? pct / 100 : pct,
      hSettim: numONull(g(k.hs)), hGiorno: numONull(g(k.hg)), tipo: tipo === "SIC" || tipo === "STD" ? tipo : "",
      attivo: s(g(k.stato)).toLowerCase() === "attivo", inizio: isoData(g(k.ini)), fine: isoData(g(k.fine)), mansione: s(g(k.mans)),
    });
  }
  return out;
}

/** Griglia del mese: il foglio col nome del mese, o quello con più colonne-data del mese. */
export function leggiGrigliaGls(sheets: SheetGrid[], mese: string): { griglia: PersonaGrigliaGls[]; giorni: string[]; foglio: string } {
  const nomeMese = MESI_IT[Number(mese.slice(5, 7)) - 1];
  const candidati = [...sheets.filter((w) => w.name.trim().toUpperCase() === nomeMese), ...sheets.filter((w) => w.name.trim().toUpperCase() !== nomeMese)];
  for (const ws of candidati) {
    const hr = ws.rows.slice(0, 8).findIndex((r) => s(r[0] ?? null).toLowerCase() === "codice fiscale" && r.some((v) => s(v).toLowerCase() === "valore"));
    if (hr < 0) continue;
    const h = ws.rows[hr];
    const cv = h.findIndex((v) => s(v).toLowerCase() === "valore");
    const cols: { c: number; d: string }[] = [];
    for (let c = cv + 1; c < h.length; c++) { const d = isoData(h[c]); if (d?.startsWith(mese)) cols.push({ c, d }); }
    if (!cols.length) continue;
    const per = new Map<string, PersonaGrigliaGls>();
    for (let r = hr + 1; r < ws.rows.length; r++) {
      const cf = normCf(s(at(ws, r, 0)));
      const voce = voceDi(s(at(ws, r, cv)));
      if (!cf || !voce) continue;
      const p = per.get(cf) ?? { cf, nome: s(at(ws, r, 1)), mansione: s(at(ws, r, 2)), voci: {} };
      const m = (p.voci[voce] ??= {});
      for (const { c, d } of cols) { const v = num(at(ws, r, c)); if (v) m[d] = (m[d] ?? 0) + v; }
      per.set(cf, p);
    }
    return { griglia: [...per.values()], giorni: cols.map((x) => x.d), foglio: ws.name };
  }
  throw new Error(`griglia del mese ${nomeMese.toLowerCase()} (intestazione "Codice Fiscale … Valore" con le date) non trovata`);
}

export function leggiPresenzeGls(sheets: SheetGrid[], mese: string): PresenzeGls {
  return { mese, anagrafica: leggiAnagraficaGls(sheets), ...leggiGrigliaGls(sheets, mese) };
}

/** Totale di una voce di una persona nel mese. */
export const totVoce = (p: PersonaGrigliaGls | undefined, v: VoceGls) => Object.values(p?.voci[v] ?? {}).reduce((a, x) => a + x, 0);

/** Attivo in un periodo: inizio ≤ ultimo giorno e fine (se c'è) ≥ primo giorno. Senza data di inizio vale il flag Attivo/Cessato. */
export function attivoNel(p: PersonaAnagraficaGls, primo: string, ultimo: string): boolean {
  if (!p.inizio) return p.attivo;
  return p.inizio <= ultimo && (!p.fine || p.fine >= primo);
}

/** Teste del foglio _ft (voci b e c): persone "Attivo" nell'Anagrafica, SIC e STD insieme. */
export const testeAttive = (a: PersonaAnagraficaGls[]) => a.filter((p) => p.attivo).length;

/** Totali della griglia per controllo (golden nei test). */
export function totaliGriglia(g: PersonaGrigliaGls[]): Record<VoceGls, number> {
  const t = Object.fromEntries(VOCI_GLS.map((v) => [v, 0])) as Record<VoceGls, number>;
  for (const p of g) for (const v of VOCI_GLS) t[v] += totVoce(p, v);
  for (const v of VOCI_GLS) t[v] = Math.round(t[v] * 100) / 100;
  return t;
}

/** Mese del file presenze (AAAA-MM): dal foglio col nome del mese e dalle sue colonne-data. */
export function mesePresenzeGls(sheets: SheetGrid[]): string | null {
  for (const ws of sheets) {
    const i = MESI_IT.indexOf(ws.name.trim().toUpperCase());
    if (i < 0) continue;
    for (const r of ws.rows.slice(0, 8)) for (const v of r) {
      const d = isoData(v);
      if (d && Number(d.slice(5, 7)) === i + 1) return d.slice(0, 7);
    }
  }
  return null;
}
