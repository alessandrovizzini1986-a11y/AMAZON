/**
 * Controllo MOG (Monte Ore Garantito) dei somministrati STD
 * (docs/costi-kit/ADDENDUM_claude_code_modulo_MOG.md): computo del mese = ore lavorate +
 * assenze retribuite, confronto con il MOG del file ADECCO_PS, proiezione a fine mese,
 * costo dell'integrazione che Adecco fattura (ore mancanti × tariffa Standard).
 */
import type { CellaX } from "@/lib/fatture/xlsxStream";
import { LAVORO, type Lavoratore } from "@/domain/presenze/lavoratori";
import { normCf } from "@/domain/costi/anagrafica";

export const SITO_DS: Record<string, string> = { valsamoggia: "DER1", santarcangelo: "DER2", origgio: "DLO2", buccinasco: "DLO4", castegnato: "DLO5", pomezia: "DLZ2", vigonza: "DVN1" };
export const dsDaSito = (sito: string) => Object.entries(SITO_DS).find(([k]) => sito.toLowerCase().includes(k))?.[1] ?? null;

/** Assenze retribuite che contano nel computo; Permesso non retribuito, Assenza ingiustificata e Riposo no. */
export const ASSENZE_RETRIBUITE = ["FERIE", "ROL", "ExF", "104", "MALATTIA", "INFORTUNIO", "PERM_SIND", "ALTRI_PERM"] as const;
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

/** MOG del mese: dal file; con una variazione nel mese pct × 169 dalla data; contratti iniziati o finiti nel mese pro-rata sui giorni di calendario. */
export function mogDelMese(c: ContrattoMog, mese: string, variazioni: VariazioneMog[] = []): number | null {
  const base = c.oreMogMese ?? (c.pctMog !== null ? (c.pctMog / 100) * DIVISORE_MESE : null);
  if (base === null) return null;
  const n = giorniMese(mese), inizio = `${mese}-01`, fine = `${mese}-${String(n).padStart(2, "0")}`;
  const da = c.dataInizio && c.dataInizio > inizio ? c.dataInizio : inizio;
  const a = c.dataFine && c.dataFine < fine ? c.dataFine : fine;
  if (a < da) return 0;
  const v = variazioni.filter((x) => x.cf === c.cf && x.validaDal <= a).sort((p, q) => p.validaDal.localeCompare(q.validaDal)).at(-1);
  let ore = 0;
  if (v && v.validaDal > da) {
    ore += base * giorni(da, addG(v.validaDal, -1)) / n + (v.pctNuova / 100) * DIVISORE_MESE * giorni(v.validaDal, a) / n;
  } else if (v) {
    ore = (v.pctNuova / 100) * DIVISORE_MESE * giorni(da, a) / n;
  } else ore = base * giorni(da, a) / n;
  return Math.round(ore * 10) / 10;
}
const addG = (iso: string, k: number) => new Date(Date.parse(iso + "T00:00:00Z") + k * 864e5).toISOString().slice(0, 10);

export type StatoMog = "OK" | "SOTTO MOG" | "A RISCHIO" | "ZERO ORE" | "NON IN FILE MOG" | "NON NEL TRACKING";

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
export function controlloMog(x: { station: string; mese: string; lavoratori: Lavoratore[]; contratti: ContrattoMog[]; variazioni?: VariazioneMog[]; finoA?: string; tariffa?: number }): EsitoMog[] {
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
    const ass = g.reduce((t, [, v]) => t + ASSENZE_RETRIBUITE.reduce((s, k) => s + (v[k] ?? 0), 0), 0);
    const nonR = g.reduce((t, [, v]) => t + (v.PERM_NR ?? 0) + (v.ASS_INGIUST ?? 0), 0);
    // solo ore non retribuite (o nessuna ora): per il MOG è come non essere nel tracking
    if (!lav && !ass) continue;
    const cf = normCf(l.cf);
    let c = contratti.find((k) => !usati.has(k.cf) && cf && k.cf === cf);
    let perNome = false;
    if (!c) { c = contratti.find((k) => !usati.has(k.cf) && stessoNome(`${k.cognome} ${k.nome}`, l.nome)); perNome = !!c; }
    const computo = r1(lav + ass);
    const base = { station: x.station, nome: l.nome, oreLavorate: r1(lav), assenzeRetribuite: r1(ass), nonRetribuite: r1(nonR), computo, abbinatoPerNome: perNome, soloAssenze: !lav && ass > 0 };
    if (!c) { out.push({ ...base, cf, pctMog: null, oreMog: null, dataFine: null, gap: null, stato: "NON IN FILE MOG", proiezione: null, giorniResidui: 0, oreMancanti: 0, costo: 0, rischioConsolidamento: false }); continue; }
    usati.add(c.cf);
    const mog = mogDelMese(c, x.mese, x.variazioni);
    // solo assenze (es. malattia tutto il mese) e nessuna ora lavorata: Adecco integra tutto il MOG
    if (!lav && mog !== null && mog > 0) {
      out.push({ ...base, cf: c.cf, pctMog: c.pctMog, oreMog: mog, dataFine: c.dataFine, gap: r1(-mog), stato: "ZERO ORE", proiezione: null, giorniResidui: 0, oreMancanti: mog,
        costo: Math.round(mog * tariffa * 100) / 100, rischioConsolidamento: /^s/i.test(c.rischioConsolidamento ?? "") });
      continue;
    }
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
  for (const c of contratti.filter((k) => !usati.has(k.cf))) {
    const mog = mogDelMese(c, x.mese, x.variazioni);
    const attivoAFine = !c.dataFine || c.dataFine >= fine;
    const zero = attivoAFine && (mog ?? 0) > 0;
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
export function consolidamentiPrevisti(contratti: ContrattoMog[], daMese?: string): ConsolidamentoMog[] {
  return contratti
    .filter((c) => /^s/i.test(c.supera20 ?? "") && c.nuovaPct !== null && c.meseProssimoConsolidamento && (!daMese || c.meseProssimoConsolidamento >= `${daMese}-01`))
    .map((c) => ({ station: c.station ?? c.sito, cf: c.cf, nome: `${c.nome} ${c.cognome}`.trim(), pctMog: c.pctMog, nuovaPct: c.nuovaPct!, oreMogMese: c.oreMogMese, nuovoMonteOre: c.nuovoMonteOre, dal: c.meseProssimoConsolidamento!, giaConsolidato: /^s/i.test(c.giaConsolidato ?? ""), scadePrima: !!c.dataFine && c.dataFine < c.meseProssimoConsolidamento! }))
    .sort((a, b) => a.dal.localeCompare(b.dal) || a.station.localeCompare(b.station));
}

export function riepilogoMog(es: EsitoMog[]) {
  const per = (s: StatoMog) => es.filter((e) => e.stato === s);
  return {
    ok: per("OK").length, sotto: per("SOTTO MOG").length, aRischio: per("A RISCHIO").length, zeroOre: per("ZERO ORE").length, nonInFile: per("NON IN FILE MOG").length, nonNelTracking: per("NON NEL TRACKING").length,
    oreMancanti: r1(es.filter((e) => e.stato === "SOTTO MOG").reduce((t, e) => t + e.oreMancanti, 0)),
    costo: Math.round(es.filter((e) => e.stato === "SOTTO MOG").reduce((t, e) => t + e.costo, 0) * 100) / 100,
    costoZeroOre: Math.round(es.filter((e) => e.stato === "ZERO ORE").reduce((t, e) => t + e.costo, 0) * 100) / 100,
  };
}
