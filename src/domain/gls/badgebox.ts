/**
 * Export Badgebox del mese ("MM_AA_Badgebox_GLS.xlsx") e controllo "chi timbra" contro il file presenze GLS.
 * È una formalità, non una correzione: il costo si calcola sempre dal file presenze.
 * Fogli: "Quantità verticali" (per persona due righe Ordinarie/Straordinari con le ore 01…31 e il Gruppo)
 * e "Timbrature verticali" (una riga per timbratura: codice, data, ora, verso E/U).
 */
import { at, num, text, type Cell, type SheetGrid } from "@/domain/presenze/grid";
import { normCf } from "@/domain/costi/anagrafica";
import { totVoce, type PersonaAnagraficaGls, type PersonaGrigliaGls } from "./presenze";

export const GRUPPO_GLS = "GLS - Castel Maggiore (BO)";

export type PersonaBadgebox = { cf: string; nome: string; gruppo: string; ore: Record<string, number> };
export type Badgebox = { persone: PersonaBadgebox[]; timbrature: Map<string, Record<string, string[]>>; altriGruppi: number };

const s = (v: Cell) => text(v).trim();
const iso = (v: string, mese: string) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : /^\d{1,2}$/.test(v) ? `${mese}-${v.padStart(2, "0")}` : null;
};
const foglio = (sheets: SheetGrid[], inizio: string) => sheets.find((w) => w.name.trim().toLowerCase().startsWith(inizio));

export const isBadgebox = (sheets: SheetGrid[]) => !!foglio(sheets, "quantit") && !!foglio(sheets, "timbrature vert");

/** Legge l'export tenendo solo il gruppo GLS (l'export contiene anche le station Amazon e altri clienti). */
export function leggiBadgebox(sheets: SheetGrid[], mese: string, gruppo = GRUPPO_GLS): Badgebox {
  const q = foglio(sheets, "quantit");
  if (!q) throw new Error('foglio "Quantità verticali" non trovato');
  const hr = q.rows.slice(0, 10).findIndex((r) => r.some((v) => s(v).toLowerCase() === "gruppo"));
  if (hr < 0) throw new Error('nel foglio "Quantità verticali" manca la colonna Gruppo');
  const h = q.rows[hr].map((v) => s(v).toLowerCase());
  const k = { nome: h.indexOf("nome"), cog: h.indexOf("cognome"), cf: h.indexOf("codice"), gr: h.indexOf("gruppo"), val: h.indexOf("valore") };
  // le colonne giorno ("01"…"31") sono nella riga sopra l'intestazione
  const giorni: { c: number; d: string }[] = [];
  for (let r = Math.max(0, hr - 2); r <= hr; r++) (q.rows[r] ?? []).forEach((v, c) => { if (c > k.val && /^\d{1,2}$/.test(s(v)) && Number(s(v)) >= 1 && Number(s(v)) <= 31) giorni.push({ c, d: `${mese}-${s(v).padStart(2, "0")}` }); });
  const per = new Map<string, PersonaBadgebox>();
  const altri = new Set<string>();
  const g = gruppo.toLowerCase();
  for (let r = hr + 1; r < q.rows.length; r++) {
    const cf = normCf(s(at(q, r, k.cf)));
    if (!cf) continue;
    const gr = s(at(q, r, k.gr));
    if (!gr.toLowerCase().includes(g)) { altri.add(cf); continue; }
    const p = per.get(cf) ?? { cf, nome: `${s(at(q, r, k.nome))} ${s(at(q, r, k.cog))}`.trim(), gruppo: gr, ore: {} };
    const voce = s(at(q, r, k.val)).toLowerCase();
    if (voce === "ordinarie" || voce === "straordinari") for (const { c, d } of giorni) { const v = num(at(q, r, c)); if (v) p.ore[d] = (p.ore[d] ?? 0) + v; }
    per.set(cf, p);
  }
  const timbrature = new Map<string, Record<string, string[]>>();
  const tv = foglio(sheets, "timbrature vert");
  if (tv) {
    const th = tv.rows.slice(0, 10).findIndex((r) => r.some((v) => s(v).toLowerCase() === "codice"));
    const hh = (tv.rows[th] ?? []).map((v) => s(v).toLowerCase());
    const c = { cf: hh.indexOf("codice"), d: hh.indexOf("d"), v: hh.indexOf("v") };
    if (th >= 0 && c.cf >= 0 && c.d >= 0 && c.v >= 0) {
      for (let r = th + 1; r < tv.rows.length; r++) {
        const cf = normCf(s(at(tv, r, c.cf)));
        if (!per.has(cf)) continue;
        const d = iso(s(at(tv, r, c.d)), mese);
        if (!d?.startsWith(mese)) continue;
        const m = timbrature.get(cf) ?? {};
        (m[d] ??= []).push(s(at(tv, r, c.v)).toUpperCase());
        timbrature.set(cf, m);
      }
    }
  }
  return { persone: [...per.values()], timbrature, altriGruppi: altri.size };
}

export type EsitoBadgebox = {
  cf: string; nome: string; tipo: string;
  oreFile: number; oreBadgebox: number; scarto: number;
  /** timbra nel gruppo GLS ma non è nella griglia del file presenze (giorni con timbrature) */
  nonNelFile: number;
  maiTimbra: boolean; giorniSenzaTimbratura: string[]; giorniSenzaOre: string[]; timbratureDispari: string[];
};

/** Ore lavorate nel file presenze in un giorno: Ordinarie + Straordinari (anche notturni). */
const oreGiorno = (p: PersonaGrigliaGls, d: string) => (p.voci.Ordinarie?.[d] ?? 0) + (p.voci.Straordinari?.[d] ?? 0) + (p.voci["Straordinari notturni"]?.[d] ?? 0);

/**
 * Esiti per persona: lavora nel file ma non timbra mai; giorni lavorati nel file senza ore Badgebox (nessuna
 * timbratura valida); giorni con timbrature e nessuna ora nel file; scarto ore file − Badgebox oltre `soglia` h
 * nel mese (solo per chi timbra); giorni con timbrature dispari; chi timbra ma non è nel file presenze.
 * Verificato su ottobre 2026: 13 mai timbrato (10 STD, 3 SIC), 58 giorni senza timbratura (max 16), 41 oltre 8 h.
 * Si tengono solo le persone con almeno un'anomalia.
 */
export function controlloBadgebox(griglia: PersonaGrigliaGls[], anag: PersonaAnagraficaGls[], bb: Badgebox, soglia = 8): EsitoBadgebox[] {
  const tipo = new Map(anag.map((a) => [a.cf, a.tipo]));
  const bbPer = new Map(bb.persone.map((p) => [p.cf, p]));
  const out: EsitoBadgebox[] = [];
  const cfs = new Set([...griglia.map((p) => p.cf), ...bb.persone.map((p) => p.cf)]);
  const gPer = new Map(griglia.map((p) => [p.cf, p]));
  for (const cf of cfs) {
    const p = gPer.get(cf), b = bbPer.get(cf), t = bb.timbrature.get(cf) ?? {};
    const lavorati = p ? [...new Set([...Object.keys(p.voci.Ordinarie ?? {}), ...Object.keys(p.voci.Straordinari ?? {}), ...Object.keys(p.voci["Straordinari notturni"] ?? {})])].filter((d) => oreGiorno(p, d) > 0).sort() : [];
    const oreFile = p ? totVoce(p, "Ordinarie") + totVoce(p, "Straordinari") + totVoce(p, "Straordinari notturni") : 0;
    const oreBadgebox = b ? Object.values(b.ore).reduce((a, x) => a + x, 0) : 0;
    const conTimbr = Object.keys(t).filter((d) => t[d].length > 0);
    const maiTimbra = lavorati.length > 0 && conTimbr.length === 0;
    const timbra = !!p && conTimbr.length > 0;
    const scarto = Math.round((oreFile - oreBadgebox) * 100) / 100;
    const e: EsitoBadgebox = {
      cf, nome: p?.nome || b?.nome || cf, tipo: tipo.get(cf) ?? "",
      oreFile: Math.round(oreFile * 100) / 100, oreBadgebox: Math.round(oreBadgebox * 100) / 100, scarto: timbra ? scarto : 0,
      nonNelFile: p ? 0 : conTimbr.length,
      maiTimbra,
      giorniSenzaTimbratura: timbra ? lavorati.filter((d) => !((b?.ore[d] ?? 0) > 0)) : [],
      giorniSenzaOre: p ? conTimbr.filter((d) => oreGiorno(p, d) === 0).sort() : [],
      timbratureDispari: conTimbr.filter((d) => t[d].length % 2 === 1).sort(),
    };
    if (e.nonNelFile || e.maiTimbra || e.giorniSenzaTimbratura.length || e.giorniSenzaOre.length || e.timbratureDispari.length || Math.abs(e.scarto) > soglia) out.push(e);
  }
  return out.sort((a, b) => Number(b.maiTimbra) - Number(a.maiTimbra) || b.giorniSenzaTimbratura.length - a.giorniSenzaTimbratura.length || Math.abs(b.scarto) - Math.abs(a.scarto));
}

export function riepilogoBadgebox(e: EsitoBadgebox[], soglia = 8) {
  const mai = e.filter((x) => x.maiTimbra);
  const senza = e.filter((x) => x.giorniSenzaTimbratura.length);
  return {
    maiTimbra: mai.length, maiTimbraStd: mai.filter((x) => x.tipo === "STD").length, maiTimbraSic: mai.filter((x) => x.tipo === "SIC").length,
    giorniSenzaTimbratura: senza.reduce((a, x) => a + x.giorniSenzaTimbratura.length, 0), personeSenzaTimbratura: senza.length,
    oltreSoglia: e.filter((x) => Math.abs(x.scarto) > soglia).length,
    nonNelFile: e.filter((x) => x.nonNelFile).length,
    giorniSenzaOre: e.reduce((a, x) => a + x.giorniSenzaOre.length, 0), dispari: e.reduce((a, x) => a + x.timbratureDispari.length, 0),
  };
}
