/**
 * Controllo MOG (Monte Ore Garantito) dei somministrati STD
 * (docs/costi-kit/ADDENDUM_claude_code_modulo_MOG.md), con le regole di Adecco (integrazioni MOG
 * di ottobre 2026, CDC 1528):
 * - MOG del mese = ore MOG al giorno (% × 169 / 100 / 26) × giorni del contratto da lunedì a sabato nel mese, max 26;
 * - computo = tutte le ore del tracking (lavoro, assenze retribuite e non retribuite), la malattia/infortunio
 *   vale le ore MOG di un giorno per ogni giorno lun–sab del periodo di malattia (dal primo all'ultimo giorno);
 * - contratto attivo anche solo una parte del mese e nessuna ora: integrazione del MOG pro-rata.
 * Costo dell'integrazione che Adecco fattura = ore mancanti × tariffa Standard.
 */
import type { CellaX } from "@/lib/fatture/xlsxStream";
import { LAVORO, type Lavoratore } from "@/domain/presenze/lavoratori";
import { normCf } from "@/domain/costi/anagrafica";

export const SITO_DS: Record<string, string> = { valsamoggia: "DER1", santarcangelo: "DER2", origgio: "DLO2", buccinasco: "DLO4", castegnato: "DLO5", pomezia: "DLZ2", vigonza: "DVN1" };
export const dsDaSito = (sito: string) => Object.entries(SITO_DS).find(([k]) => sito.toLowerCase().includes(k))?.[1] ?? null;

/** Assenze retribuite (contano nel computo; come Adecco contano anche permesso non retribuito e assenza ingiustificata, non il Riposo). */
export const ASSENZE_RETRIBUITE = ["FERIE", "ROL", "ExF", "104", "MALATTIA", "INFORTUNIO", "PERM_SIND", "ALTRI_PERM"] as const;
const MALATTIA = ["MALATTIA", "INFORTUNIO"] as const;
export const DIVISORE_MESE = 169; // ore mensili FT 39 h
export const TARIFFA_DEFAULT = 20.86;

export type ContrattoMog = {
  cf: string; nome: string; cognome: string; station: string | null; sito: string; dataInizio: string | null; dataFine: string | null;
  pctMog: number | null; oreMogMese: number | null; oreMogSett: number | null; giaConsolidato: string | null;
  rischioConsolidamento: string | null; mediaOreSemestre: number | null; ventiPctMog: number | null; meseProssimoConsolidamento: string | null;
  /** colonne del consolidamento (file PS, foglio PS) */
  proroghe: number | null; oreRetribuite6m: number | null; oreEccedenti6m: number | null; mediaOreAnzianita: number | null;
  mesePrimoConsolidamento: string | null; meseConsolidato: string | null; supera20: string | null;
  pctDaConsolidare: number | null; nuovoMonteOre: number | null; nuovaPct: number | null; orarioSettConsolidato: number | null;
};

const testo = (v: CellaX) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: CellaX) => (typeof v === "number" ? v : v === null || v === "" ? null : Number.isFinite(Number(String(v).replace(",", "."))) ? Number(String(v).replace(",", ".")) : null);
const dataIso = (v: CellaX): string | null => {
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10);
  const s = testo(v); const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s) ?? /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (!m) return null;
  return m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
};

/** Il file ADECCO_PS (foglio PS) ha l'intestazione nella riga con "Codice fiscale"; in A di quella riga la data di chiusura payroll. */
export const isIntestazioneMog = (celle: CellaX[]) => celle.some((c) => testo(c).toLowerCase() === "codice fiscale") && celle.some((c) => testo(c).toLowerCase().startsWith("% mog"));

/** Colonne per prefisso (le intestazioni del file hanno spazi e a capo in coda). */
export function colonnaMog(intestazioni: string[], prefisso: string) {
  const p = prefisso.toLowerCase();
  return intestazioni.find((h) => h.replace(/\s+/g, " ").trim().toLowerCase().startsWith(p)) ?? null;
}

export function contrattoDaRiga(riga: Record<string, CellaX>, intestazioni: string[]): ContrattoMog | null {
  const g = (p: string) => { const c = colonnaMog(intestazioni, p); return c ? riga[c] ?? null : null; };
  const cf = normCf(testo(g("Codice fiscale")));
  if (!cf || cf.length < 11) return null;
  const sito = testo(g("Sito"));
  return {
    cf, nome: testo(g("Nome")), cognome: testo(g("Cognome")), station: dsDaSito(sito), sito, dataInizio: dataIso(g("Data Inizio Contratto")), dataFine: dataIso(g("Data Fine Contratto")),
    pctMog: num(g("% MOG da contratto")), oreMogMese: num(g("OreMog sul mese")), oreMogSett: num(g("OreMog settimanali")), giaConsolidato: testo(g("Già consolidato")) || null,
    rischioConsolidamento: testo(g("Rischio consolidamento")) || null, mediaOreSemestre: num(g("Media delle ore settimanali retribuite")), ventiPctMog: num(g("Quanto è il 20% del mog")),
    meseProssimoConsolidamento: dataIso(g("Mese prossimo possibile")),
    proroghe: num(g("Proroghe")), oreRetribuite6m: num(g("Ore retribuite negli ultimi 6")), oreEccedenti6m: num(g("Ore eccedenti MOG")),
    mediaOreAnzianita: num(g("Media delle ore settimanali retribuite mesi")), mesePrimoConsolidamento: dataIso(g("Mese primo possibile")),
    meseConsolidato: dataIso(g("Mese in cui è stato consolidato")), supera20: testo(g("La media delle ore dei 6 mesi")) || null,
    // "Nessuna Modifica" = nessun consolidamento previsto
    pctDaConsolidare: num(g("Quanto è la % da consolidare")), nuovoMonteOre: num(g("Nuovo Monte ore")), nuovaPct: num(g("Nuova % MOG")), orarioSettConsolidato: num(g("Orario settimanale mog consolidato")),
  };
}

export type VariazioneMog = { cf: string; pctNuova: number; validaDal: string };

/** Token del nome per il confronto (minuscolo, senza accenti e apostrofi). */
const token = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’`]/g, "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
/** Abbinamento per nome: i token dell'uno contenuti in quelli dell'altro (ordine indifferente). */
export function stessoNome(a: string, b: string) {
  const x = new Set(token(a)), y = new Set(token(b));
  if (!x.size || !y.size) return false;
  const [p, q] = x.size <= y.size ? [x, y] : [y, x];
  return [...p].every((t) => q.has(t)) && p.size >= 2;
}

const giorniMese = (m: string) => { const [a, b] = m.split("-").map(Number); return new Date(Date.UTC(a, b, 0)).getUTCDate(); };
const giorni = (da: string, a: string) => Math.round((Date.parse(a) - Date.parse(da)) / 864e5) + 1;

/** Domenica: fuori dai giorni MOG (Adecco conta i giorni da lunedì a sabato). */
const domenica = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay() === 0;
const GG_MOG_MESE = 26;
/** % MOG valida in un giorno: quella del contratto o l'ultima variazione (aumento) già in vigore. */
function pctAl(c: ContrattoMog, giorno: string, variazioni: VariazioneMog[]): number | null {
  const v = variazioni.filter((x) => x.cf === c.cf && x.validaDal <= giorno).sort((p, q) => p.validaDal.localeCompare(q.validaDal)).at(-1);
  if (v) return v.pctNuova;
  if (c.pctMog !== null) return c.pctMog;
  return c.oreMogMese !== null ? (c.oreMogMese / DIVISORE_MESE) * 100 : null;
}
/** Ore MOG di un giorno (% × 169 / 100 / 26). */
export const oreMogGiorno = (c: ContrattoMog, giorno: string, variazioni: VariazioneMog[] = []) => { const p = pctAl(c, giorno, variazioni); return p === null ? null : ((p / 100) * DIVISORE_MESE) / GG_MOG_MESE; };
/** Giorni MOG (lun–sab) del contratto tra da e a, compresi. */
function giorniMog(c: ContrattoMog, da: string, a: string): string[] {
  const out: string[] = [];
  const ini = c.dataInizio && c.dataInizio > da ? c.dataInizio : da, fin = c.dataFine && c.dataFine < a ? c.dataFine : a;
  for (let d = ini; d <= fin; d = addG(d, 1)) if (!domenica(d)) out.push(d);
  return out;
}

/** MOG del mese come Adecco: ore MOG al giorno × giorni lun–sab del contratto nel mese (max 26), con gli aumenti dalla loro data. */
export function mogDelMese(c: ContrattoMog, mese: string, variazioni: VariazioneMog[] = []): number | null {
  if (pctAl(c, `${mese}-01`, variazioni) === null && c.oreMogMese === null) return null;
  const n = giorniMese(mese);
  const gg = giorniMog(c, `${mese}-01`, `${mese}-${String(n).padStart(2, "0")}`).slice(0, GG_MOG_MESE);
  // + 1e-9: 34,125 resta 34,13 come nella lista Adecco (34,125 × 100 in virgola mobile è 3412,4999…)
  return Math.round(gg.reduce((t, d) => t + (oreMogGiorno(c, d, variazioni) ?? 0), 0) * 100 + 1e-9) / 100;
}
const addG = (iso: string, k: number) => new Date(Date.parse(iso + "T00:00:00Z") + k * 864e5).toISOString().slice(0, 10);

/** SU GLS: nel file MOG della station ma lavora su GLS Castel Maggiore (foglio GLS del tracking): fuori dalla stima Amazon. */
export type StatoMog = "OK" | "SOTTO MOG" | "A RISCHIO" | "ZERO ORE" | "NON IN FILE MOG" | "NON NEL TRACKING" | "SU GLS";

export type EsitoMog = {
  station: string; nome: string; cf: string; pctMog: number | null; oreMog: number | null; dataFine: string | null;
  oreLavorate: number; assenzeRetribuite: number; nonRetribuite: number; computo: number; gap: number | null;
  stato: StatoMog; proiezione: number | null; giorniResidui: number; oreMancanti: number; costo: number;
  rischioConsolidamento: boolean; abbinatoPerNome: boolean;
  /** computo fatto solo di assenze retribuite (es. malattia tutto il mese): OK per la regola, da guardare */
  soloAssenze: boolean;
};

const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Esiti MOG della station per il mese. `finoA` = ultimo giorno considerato (fine mese per il controllo
 * di fine mese, oggi per quello settimanale): prima della fine del mese il gap si valuta sulla proiezione.
 */
export function controlloMog(x: { station: string; mese: string; lavoratori: Lavoratore[]; contratti: ContrattoMog[]; variazioni?: VariazioneMog[]; finoA?: string; tariffa?: number; suGls?: { nome: string; cf: string }[] }): EsitoMog[] {
  const fine = `${x.mese}-${String(giorniMese(x.mese)).padStart(2, "0")}`;
  const finoA = x.finoA && x.finoA < fine ? x.finoA : fine;
  const chiuso = finoA >= fine;
  const tariffa = x.tariffa ?? TARIFFA_DEFAULT;
  const contratti = x.contratti.filter((c) => c.station === x.station);
  const usati = new Set<string>();
  const out: EsitoMog[] = [];
  for (const l of x.lavoratori) {
    const g = Object.entries(l.giorni).filter(([d]) => d.startsWith(x.mese) && d <= finoA);
    const lav = g.reduce((t, [, v]) => t + LAVORO.reduce((s, k) => s + (v[k] ?? 0), 0), 0);
    const ass = g.reduce((t, [, v]) => t + ASSENZE_RETRIBUITE.filter((k) => !MALATTIA.includes(k as never)).reduce((s, k) => s + (v[k] ?? 0), 0), 0);
    const nonR = g.reduce((t, [, v]) => t + (v.PERM_NR ?? 0) + (v.ASS_INGIUST ?? 0), 0);
    const giorniMal = g.filter(([, v]) => MALATTIA.some((k) => v[k])).map(([d]) => d).sort();
    const oreMalTracking = g.reduce((t, [, v]) => t + MALATTIA.reduce((s, k) => s + (v[k] ?? 0), 0), 0);
    if (!lav && !ass && !nonR && !giorniMal.length) continue;
    const cf = normCf(l.cf);
    let c = contratti.find((k) => !usati.has(k.cf) && cf && k.cf === cf);
    let perNome = false;
    if (!c) { c = contratti.find((k) => !usati.has(k.cf) && stessoNome(`${k.cognome} ${k.nome}`, l.nome)); perNome = !!c; }
    // malattia/infortunio: ore MOG di un giorno per ogni giorno lun–sab del periodo (Adecco); senza contratto le ore del tracking
    const malattia = c && giorniMal.length ? giorniMog(c, giorniMal[0], giorniMal.at(-1)!).reduce((t, d) => t + (oreMogGiorno(c!, d, x.variazioni) ?? 0), 0) : oreMalTracking;
    const computo = r1(lav + ass + nonR + malattia);
    const base = { station: x.station, nome: l.nome, oreLavorate: r1(lav), assenzeRetribuite: r1(ass + malattia), nonRetribuite: r1(nonR), computo, abbinatoPerNome: perNome, soloAssenze: !lav && computo > 0 };
    if (!c) { out.push({ ...base, cf, pctMog: null, oreMog: null, dataFine: null, gap: null, stato: "NON IN FILE MOG", proiezione: null, giorniResidui: 0, oreMancanti: 0, costo: 0, rischioConsolidamento: false }); continue; }
    usati.add(c.cf);
    const mog = mogDelMese(c, x.mese, x.variazioni);
    // proiezione: media ore per giorno lavorato × giorni lavorativi residui (5 su 7 dei giorni di calendario fino alla fine del contratto/mese)
    const fineEff = c.dataFine && c.dataFine < fine ? c.dataFine : fine;
    const residui = chiuso ? 0 : Math.max(0, Math.round(giorni(addG(finoA, 1), fineEff) * 5 / 7));
    const giorniLav = g.filter(([, v]) => LAVORO.some((k) => v[k])).length;
    const proiezione = chiuso ? computo : r1(computo + (giorniLav ? lav / giorniLav : 0) * residui);
    const gap = mog === null ? null : r1((chiuso ? computo : proiezione) - mog);
    const stato: StatoMog = mog === null ? "NON IN FILE MOG" : chiuso ? (gap! >= 0 ? "OK" : "SOTTO MOG") : proiezione < mog - 4 ? "A RISCHIO" : "OK";
    const mancanti = mog === null ? 0 : r1(Math.max(0, mog - (chiuso ? computo : proiezione)));
    out.push({
      ...base, cf: c.cf, pctMog: c.pctMog, oreMog: mog, dataFine: c.dataFine, gap, stato, proiezione: chiuso ? null : proiezione, giorniResidui: residui, oreMancanti: stato === "OK" ? 0 : mancanti,
      costo: stato === "SOTTO MOG" ? Math.round(mancanti * tariffa * 100) / 100 : 0, rischioConsolidamento: /^s/i.test(c.rischioConsolidamento ?? ""),
    });
  }
  // nel file ma non nel tracking: con contratto attivo fino a fine mese = ZERO ORE (rischio integrazione piena)
  const gls = (x.suGls ?? []).map((g) => ({ nome: g.nome, cf: normCf(g.cf) }));
  for (const c of contratti.filter((k) => !usati.has(k.cf))) {
    const mog = mogDelMese(c, x.mese, x.variazioni);
    // lavora su GLS (foglio GLS del tracking): il MOG si controlla sul tracking GLS, non è un costo Amazon
    if (gls.some((g) => (g.cf && g.cf === c.cf) || stessoNome(`${c.cognome} ${c.nome}`, g.nome))) {
      out.push({
        station: x.station, nome: `${c.nome} ${c.cognome}`.trim(), cf: c.cf, pctMog: c.pctMog, oreMog: mog, dataFine: c.dataFine, oreLavorate: 0, assenzeRetribuite: 0, nonRetribuite: 0, computo: 0,
        gap: null, stato: "SU GLS", proiezione: null, giorniResidui: 0, oreMancanti: 0, costo: 0, rischioConsolidamento: /^s/i.test(c.rischioConsolidamento ?? ""), abbinatoPerNome: false, soloAssenze: false,
      });
      continue;
    }
    // contratto attivo almeno una parte del mese (anche finito nel mese) e nessuna ora: Adecco integra il MOG pro-rata
    const zero = (mog ?? 0) > 0;
    out.push({
      station: x.station, nome: `${c.nome} ${c.cognome}`.trim(), cf: c.cf, pctMog: c.pctMog, oreMog: mog, dataFine: c.dataFine, oreLavorate: 0, assenzeRetribuite: 0, nonRetribuite: 0, computo: 0,
      gap: mog === null ? null : -mog, stato: zero ? "ZERO ORE" : "NON NEL TRACKING", proiezione: null, giorniResidui: 0, oreMancanti: zero ? mog ?? 0 : 0,
      costo: zero ? Math.round((mog ?? 0) * tariffa * 100) / 100 : 0, rischioConsolidamento: /^s/i.test(c.rischioConsolidamento ?? ""), abbinatoPerNome: false, soloAssenze: false,
    });
  }
  return out;
}

export type ConsolidamentoMog = { station: string; cf: string; nome: string; pctMog: number | null; nuovaPct: number; oreMogMese: number | null; nuovoMonteOre: number | null; dal: string; giaConsolidato: boolean; /** il contratto scade prima del mese di consolidamento (vale solo con una proroga) */ scadePrima: boolean };

/**
 * Consolidamenti previsti dal file: la media delle ore retribuite degli ultimi 6 mesi supera il MOG del 20 %
 * ("SI") e il file calcola la nuova % e il nuovo monte ore dal "Mese prossimo possibile consolidamento".
 * È un rischio, non un cambio: il MOG del mese non cambia finché non arriva il file aggiornato o un aumento.
 */
export function consolidamentiPrevisti(contratti: ContrattoMog[], daMese?: string, variazioni: VariazioneMog[] = []): ConsolidamentoMog[] {
  // chi ha già avuto un aumento almeno alla nuova % (lettera Adecco) non è più un rischio
  const giaAumentati = new Set(variazioni.filter((v) => contratti.some((c) => c.cf === v.cf && c.nuovaPct !== null && v.pctNuova >= c.nuovaPct - 0.005)).map((v) => v.cf));
  return contratti
    .filter((c) => !giaAumentati.has(c.cf))
    .filter((c) => /^s/i.test(c.supera20 ?? "") && c.nuovaPct !== null && c.meseProssimoConsolidamento && (!daMese || c.meseProssimoConsolidamento >= `${daMese}-01`))
    .map((c) => ({ station: c.station ?? c.sito, cf: c.cf, nome: `${c.nome} ${c.cognome}`.trim(), pctMog: c.pctMog, nuovaPct: c.nuovaPct!, oreMogMese: c.oreMogMese, nuovoMonteOre: c.nuovoMonteOre, dal: c.meseProssimoConsolidamento!, giaConsolidato: /^s/i.test(c.giaConsolidato ?? ""), scadePrima: !!c.dataFine && c.dataFine < c.meseProssimoConsolidamento! }))
    .sort((a, b) => a.dal.localeCompare(b.dal) || a.station.localeCompare(b.station));
}

export function riepilogoMog(es: EsitoMog[]) {
  const per = (s: StatoMog) => es.filter((e) => e.stato === s);
  return {
    ok: per("OK").length, sotto: per("SOTTO MOG").length, aRischio: per("A RISCHIO").length, zeroOre: per("ZERO ORE").length, nonInFile: per("NON IN FILE MOG").length, nonNelTracking: per("NON NEL TRACKING").length, suGls: per("SU GLS").length,
    oreMancanti: r1(es.filter((e) => e.stato === "SOTTO MOG").reduce((t, e) => t + e.oreMancanti, 0)),
    costo: Math.round(es.filter((e) => e.stato === "SOTTO MOG").reduce((t, e) => t + e.costo, 0) * 100) / 100,
    costoZeroOre: Math.round(es.filter((e) => e.stato === "ZERO ORE").reduce((t, e) => t + e.costo, 0) * 100) / 100,
  };
}

/**
 * Lavoratori dei fogli GLS di un tracking (nome del foglio con "gls", di qualunque mese): servono solo a
 * sapere chi lavora su GLS Castel Maggiore. Intestazione con "Tipo" e "Codice fiscale"; una riga Standard per lavoratore.
 */
export function lavoratoriGls(sheets: { name: string; rows: unknown[][] }[]): { nome: string; cf: string }[] {
  const out = new Map<string, { nome: string; cf: string }>();
  for (const g of sheets.filter((s) => /gls/i.test(s.name))) {
    const t = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
    const hi = g.rows.slice(0, 10).findIndex((r) => (r ?? []).some((v) => t(v).toLowerCase() === "tipo"));
    if (hi < 0) continue;
    const h = (g.rows[hi] ?? []).map((v) => t(v).toLowerCase());
    const cTipo = h.indexOf("tipo"), cCf = h.findIndex((v) => v.startsWith("codice f"));
    const cNome = [h.findIndex((v) => v.startsWith("lavorat")), h.indexOf("driver"), h.findIndex((v) => v.startsWith("nominativ"))].find((i) => i >= 0) ?? -1;
    for (const r of g.rows.slice(hi + 1)) {
      if (!r || t(r[cTipo]).toLowerCase() !== "standard") continue;
      const nome = cNome >= 0 ? t(r[cNome]) : "", cf = cCf >= 0 ? normCf(t(r[cCf])) : "";
      if (nome || cf) out.set(cf || nome.toLowerCase(), { nome, cf });
    }
  }
  return [...out.values()];
}
