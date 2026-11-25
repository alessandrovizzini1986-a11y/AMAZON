/**
 * Verifica tracking secondo CCNL e Accordo di secondo livello (docs/presenze-kit/regole/PROMPT_verifica_tracking_ccnl.md).
 * Si aggiunge al controllo tracking vs Amazon (controlloSettimanale) e produce un unico elenco di richieste per gli
 * Operation Supervisor, con una chiave stabile: così lo stato (da fare / richiesta / ok) resta tra un controllo e l'altro.
 *
 * Regole delle ore, per settimana lunedì–domenica:
 * - Standard fino alle ore di contratto (full time 39; part time le sue ore), tolte le assenze retribuite della settimana;
 * - part time: le ore oltre contratto fino a 39 sono Supplementare;
 * - da 39 al tetto dell'Accordo le ore sono assorbite: riga Accordo (va bene anche sotto le 39 ore, per la mezz'ora in più del giorno);
 * - oltre il tetto: Straordinario.
 * Tetto (CCNL art. 11 quinquies, Accordo art. 4): 43 h fino al 31/05/2026, 42 h dal 01/06/2026, 41 h dal 01/07/2027.
 */
import { addDays, weekday } from "./grid";
import { ASSENZE_NON_RETRIB, ASSENZE_RETRIB, leggiLavoratori, type Lavoratore } from "./lavoratori";
import { alertDelGiorno, nomeInElenco, type EsitoSettimanale, type TrackingInput } from "./controlloSettimanale";
import { findTrackingSheet } from "./tracking";
import { normName, type Station } from "./regole";

export const ORE_FT = 39;
export const TOLLERANZA = 0.5; // ore: sotto questa differenza non si segnala
export const STD_MAX_GIORNO = 8.4; // 8h24 (Accordo art. 4)
export const STR_MAX_SETT = 12; // CCNL art. 13

/** Tetto settimanale fino a cui le ore sono assorbite (riga Accordo). */
export function tettoAccordo(data: string): number {
  return data < "2026-06-01" ? 43 : data < "2027-07-01" ? 42 : 41;
}

export type Contratto = { tipo: "FT" | "PT" | "MOG" | "DISPATCHER" | "ND"; ore: number | null };

/** "CTI FT" → 39 · "CTI PT 32H" → 32 · "PT OR 32,5H" → 32,5 · "STD PT 60%" → 23,4 · "MOG 35%" → MOG · "CTI PT" → ore non note. */
export function leggiContratto(s: string): Contratto {
  const u = s.toUpperCase().replace(/\s+/g, " ").trim();
  if (u.includes("DISPATCH") || u === "DSP") return { tipo: "DISPATCHER", ore: null };
  if (u.includes("MOG")) return { tipo: "MOG", ore: null };
  const n = (x: string) => Number(x.replace(",", "."));
  const h = /(\d{1,2}(?:[.,]\d+)?)\s*H\b/.exec(u);
  const pt = /\bPT\b|PART/.test(u);
  if (h && n(h[1]) < ORE_FT) return { tipo: "PT", ore: n(h[1]) };
  if (pt) {
    const p = /(\d{1,3}(?:[.,]\d+)?)\s*%?\s*$/.exec(u);
    return { tipo: "PT", ore: p && n(p[1]) > 0 && n(p[1]) < 100 ? Math.round(ORE_FT * n(p[1])) / 100 : null };
  }
  if (/\bFT\b|FULL/.test(u)) return { tipo: "FT", ore: ORE_FT };
  return { tipo: "ND", ore: null };
}

export type Riparto = { std: number; sup: number; acc: number; str: number };

/** Come vanno divise le ore lavorate della settimana. */
export function ripartoAtteso(lavorate: number, assenze: number, c: Contratto, tetto: number): Riparto {
  const base = c.tipo === "PT" && c.ore ? c.ore : ORE_FT;
  const std = Math.min(lavorate, Math.max(base - assenze, 0));
  let r = lavorate - std;
  const sup = c.tipo === "PT" ? Math.min(r, Math.max(ORE_FT - assenze - std, 0)) : 0;
  r -= sup;
  const acc = Math.min(r, Math.max(tetto - ORE_FT, 0));
  return { std, sup, acc, str: r - acc };
}

/** `nr` = ore di assenza NON retribuita (sciopero, permesso non retribuito, assenza ingiustificata): non si pagano ma contano nelle 39 ore. */
export type OreGiorno = { std: number; sup: number; acc: number; str: number; ass: number; nr?: number };
export type Persona = {
  station: Station; pop: "SIC" | "STD"; nome: string; cf: string; driverId: string; contratto: string;
  /** giorno ISO → ore (solo i giorni con qualcosa) */
  giorni: Map<string, OreGiorno>;
  /** giorno ISO → sigla della riga RIPOSO (solo i giorni del mese con una sigla) */
  sigle?: Map<string, string>;
};

/**
 * Sigle di assenza retribuita nella riga RIPOSO: il giorno conta verso le 39 ore della settimana, quindi le ore vanno scritte
 * anche nella riga dell'assenza. Se mancano, il conto della settimana si fa lo stesso con una giornata da 7,8 ore.
 */
export const SIGLE_ASSENZA: Record<string, string> = { F: "FERIE", FERIE: "FERIE", ROL: "ROL", EXF: "EXF", EX: "EXF", M: "MALATTIA", MAL: "MALATTIA", I: "INFORTUNIO", INF: "INFORTUNIO" };
/**
 * Sigle di assenza NON retribuita nella riga RIPOSO: sciopero e permesso non retribuito. Non si pagano, ma il giorno conta
 * lo stesso verso le 39 ore della settimana (deciso da Alessandro il 24/11/2026), quindi lo Straordinario dopo è lecito.
 */
export const SIGLE_NON_RETRIB = new Set(["S", "SC", "SCI", "SCIOP", "SCIOPERO", "PNR", "PNR.", "P.N.R."]);
/** Station dove i part time sono trattati come MOG: i controlli sul Supplementare non si fanno (deciso da Alessandro il 24/11/2026). */
export const STATION_SENZA_SUPPLEMENTARE = new Set<string>(["DER2"]);
export const ORE_GIORNO_ASSENZA = 7.8;
/** Oltre queste ore lavorate in un giorno, il resto della giornata può stare in Straordinario. */
export const ORE_GIORNO_STR = 8;

const chiavePersona = (l: Lavoratore) => (l.cf.trim().toUpperCase() || l.matricola || normName(l.nome));
const lav = (g: OreGiorno | undefined) => (g ? g.std + g.sup + g.acc + g.str : 0);
/** Il giorno ha una sigla di assenza retribuita nella riga RIPOSO, ma né ore di assenza né ore di lavoro. */
// Festività nazionali a data fissa (più Pasquetta, che cambia): in quei giorni un'assenza segnata non chiede ore
const FESTE_FISSE = new Set(["01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "11-01", "12-08", "12-25", "12-26"]);
const giornoDiRiposoPerTutti = (d: string) => weekday(d) === 6 || FESTE_FISSE.has(d.slice(5));
/**
 * Assenza segnata con la sola sigla (es. «M» nella riga RIPOSO) senza ore. Le ore servono solo se quel giorno il lavoratore
 * doveva lavorare "da contratto", e i giorni di contratto non sono nel tracking (chiarito dagli OS, deciso da Alessandro il 25/11/2026):
 *  - MOG: non ha giorni fissi → non si chiede niente e la sigla non conta verso le 39 ore;
 *  - part time: non si sa quali sono i suoi giorni → non si chiede niente, ma la sigla conta verso le 39 ore
 *    (così uno Straordinario dopo una giornata di ferie non viene segnalato a torto);
 *  - tempo pieno: si chiede solo se nella settimana ha meno di 5 giorni tra lavorati e assenze con le ore
 *    (con 5 giorni già pieni, quello con la sigla è il suo giorno di riposo);
 *  - domeniche e festivi: mai.
 */
const contaVerso39 = (x: Persona, c: Contratto, d: string) => assenzaSenzaOre(x, d) && c.tipo !== "MOG" && !giornoDiRiposoPerTutti(d);
const giorniPieniDellaSettimana = (x: Persona, d: string) => { let l = d; while (weekday(l) !== 0) l = addDays(l, -1); return [0, 1, 2, 3, 4, 5, 6].filter((k) => { const o = x.giorni.get(addDays(l, k)); return !!o && (lav(o) > 0 || o.ass > 0); }).length; };
const chiediLeOre = (x: Persona, c: Contratto, d: string) => contaVerso39(x, c, d) && c.tipo !== "PT" && giorniPieniDellaSettimana(x, d) < 5;
const assenzaSenzaOre = (x: Persona, d: string) => { const sg = x.sigle?.get(d); const g = x.giorni.get(d); return !!sg && sg in SIGLE_ASSENZA && !(g && (g.ass > 0 || lav(g) > 0)); };
const r1 = (x: number) => Math.round(x * 100) / 100;
const it = (x: number) => String(r1(x)).replace(".", ",");
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const prec = (mese: string) => { const [y, m] = mese.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };

/**
 * Persone dei tracking del mese con le ore per giorno, più i giorni del mese prima quando ci sono (file del mese
 * prima nell'archivio, oppure le colonne che sconfinano nel file del mese): servono per le settimane a cavallo.
 * `coperti` dice, per station e popolazione, di quali giorni abbiamo il tracking.
 */
export function personeDelMese(tracking: TrackingInput[], mese: string, precedenti: TrackingInput[] = []): { persone: Persona[]; coperti: Map<string, Set<string>>; avvisi: string[] } {
  const persone: Persona[] = [], coperti = new Map<string, Set<string>>(), avvisi: string[] = [];
  const ym = (m: string) => m.split("-").map(Number) as [number, number];
  for (const t of tracking) {
    const k = `${t.station}|${t.tipo}`;
    let foglio: string, giorniFoglio: string[], lavoratori: Lavoratore[];
    try {
      const ts = findTrackingSheet(t.sheets, ...ym(mese));
      foglio = ts.grid.name; giorniFoglio = ts.dayCols.map((d) => d.date);
      lavoratori = leggiLavoratori(t.sheets, ...ym(mese), true).lavoratori; // anche le colonne che sconfinano
    } catch { avvisi.push(`${t.station} ${t.tipo}: nel file ${t.fileName} non trovo i giorni di ${mese.slice(5)}/${mese.slice(0, 4)}`); continue; }
    const cop = coperti.get(k) ?? new Set<string>();
    giorniFoglio.forEach((d) => cop.add(d));
    // mese prima: il suo file nell'archivio, oppure il suo foglio nello stesso file (mai lo stesso foglio riletto:
    // con i giorni scritti come numeri 1..31 un foglio non dice da solo di che mese è)
    const pm = prec(mese);
    const prima = new Map<string, Lavoratore>();
    const copPrima = new Set<string>();
    const fp = precedenti.find((x) => x.station === t.station && x.tipo === t.tipo);
    for (const [sheets, stesso] of [[fp?.sheets, false], [t.sheets, true]] as const) {
      if (!sheets) continue;
      try {
        const ts = findTrackingSheet(sheets, ...ym(pm));
        if (stesso && ts.grid.name === foglio) continue;
        const gg = ts.dayCols.map((d) => d.date).filter((d) => d.startsWith(pm + "-"));
        for (const l of leggiLavoratori(sheets, ...ym(pm)).lavoratori) {
          const kp = chiavePersona(l), gia = prima.get(kp);
          if (!gia) prima.set(kp, { ...l, giorni: { ...l.giorni } });
          else for (const [d, v] of Object.entries(l.giorni)) if (!copPrima.has(d)) gia.giorni[d] = v;
        }
        gg.forEach((d) => copPrima.add(d));
      } catch { /* quel file non ha il mese prima */ }
    }
    copPrima.forEach((d) => cop.add(d));
    coperti.set(k, cop);
    for (const l of lavoratori) {
      const giorni = new Map<string, OreGiorno>();
      // prima le colonne che sconfinano nel foglio del mese, poi (se c'è) il tracking del mese prima, che vale di più
      const sconfino = Object.fromEntries(Object.entries(l.giorni).filter(([d]) => !d.startsWith(mese + "-")));
      const delMese = Object.fromEntries(Object.entries(l.giorni).filter(([d]) => d.startsWith(mese + "-")));
      for (const src of [sconfino, prima.get(chiavePersona(l))?.giorni ?? {}, delMese]) {
        for (const [d, v] of Object.entries(src)) {
          const o: OreGiorno = { std: v.Standard ?? 0, sup: v.Supplementare ?? 0, acc: v.Accordo ?? 0, str: v.Straordinario ?? 0, ass: ASSENZE_RETRIB.reduce((s, a) => s + (v[a] ?? 0), 0), nr: ASSENZE_NON_RETRIB.reduce((s, a) => s + (v[a] ?? 0), 0) };
          if (o.std + o.sup + o.acc + o.str + o.ass + (o.nr ?? 0) > 0) giorni.set(d, o); else giorni.delete(d);
        }
      }
      const sigle = new Map(Object.entries(l.riposo ?? {}).filter(([d]) => d.startsWith(mese + "-")));
      persone.push({ station: t.station, pop: t.tipo, nome: l.nome, cf: l.cf.trim().toUpperCase(), driverId: l.driverId, contratto: l.contratto, giorni, sigle });
    }
  }
  return { persone, coperti, avvisi };
}
export type TipoRichiesta = "+1" | "-1" | "H" | "A" | "ORE" | "ACC" | "7GG" | "STR_PRIMA" | "STD_OLTRE" | "SUP" | "RIPARTO" | "ASSENZE" | "STD_GIORNO" | "STR_SETT" | "ASS_ORE" | "DOPPIO" | "ID";
export const ETICHETTA_TIPO: Record<TipoRichiesta, string> = {
  "+1": "Trasferta senza rotta Amazon", "-1": "Rotta Amazon ma zero ore", H: "Ore senza Amazon", A: "Su Amazon, non nel tracking",
  ORE: "Ore del giorno anomale", ACC: "Accordo di domenica (somministrati)", "7GG": "7 o più giorni di fila",
  STR_PRIMA: "Straordinario prima delle 39 ore", STD_OLTRE: "Standard oltre le ore di contratto",
  SUP: "Supplementare su un non part time", RIPARTO: "Ore della settimana da spostare", ASSENZE: "Ore e assenze: troppe nella settimana", STD_GIORNO: "Standard oltre 8h24 nel giorno", STR_SETT: "Straordinario oltre 12 h in settimana", ASS_ORE: "Assenza segnata senza le ore", DOPPIO: "Driver in tutti e due i tracking (STD e SIC)", ID: "ID di un altro driver nel suo blocco",
};
/**
 * Gruppi per il menu dei filtri: quattro domande al posto di quattordici tipi. Il tipo preciso resta nella colonna Tipo
 * e nei messaggi per gli OS.
 */
export const GRUPPI_TIPO = [
  { id: "DOPPIO", nome: "Driver doppio o ID sbagliato (grave)", tipi: ["DOPPIO", "ID"] },
  { id: "GIORNI", nome: "Ha lavorato davvero? (tracking e Amazon non coincidono)", tipi: ["-1", "+1", "H", "A"] },
  { id: "ORE", nome: "Ore nella riga sbagliata", tipi: ["STR_PRIMA", "STD_OLTRE", "SUP", "RIPARTO", "ASSENZE", "STR_SETT", "STD_GIORNO", "ORE", "ASS_ORE"] },
  { id: "ACCORDO", nome: "Accordo di domenica (non più richiesto)", tipi: ["ACC"] },
  { id: "RIPOSI", nome: "Riposi: 7 o più giorni di fila", tipi: ["7GG"] },
] as const satisfies readonly { id: string; nome: string; tipi: readonly TipoRichiesta[] }[];
export const gruppoDi = (t: string) => GRUPPI_TIPO.find((g) => (g.tipi as readonly string[]).includes(t))?.id ?? "ORE";

/** Ordine nel messaggio e nelle tabelle: prima le violazioni. */
export const ORDINE_TIPO: TipoRichiesta[] = ["DOPPIO", "ID", "7GG", "STR_PRIMA", "STD_OLTRE", "SUP", "RIPARTO", "ASSENZE", "STR_SETT", "STD_GIORNO", "-1", "+1", "H", "A", "ORE", "ACC", "ASS_ORE"];

export type Richiesta = {
  /** mese|station|pop|persona|tipo|riferimento: non contiene numeri che cambiano, così lo stato resta */
  chiave: string; mese: string; station: Station; pop: string; driver: string; tipo: TipoRichiesta;
  /** giorno o lunedì della settimana (AAAA-MM-GG) */
  rif: string; periodo: string; testo: string;
  /** lo stesso punto in poche parole: è la riga della tabellina che si manda agli OS */
  breve: string;
};

export type SettimanaRiga = {
  station: Station; pop: string; driver: string; contratto: string; lunedi: string; periodo: string; giorniLavorati: number;
  std: number; sup: number; acc: number; str: number; ass: number; tot: number; atteso: Riparto | null; esito: string;
};
export type SeiDomenica = { station: Station; pop: string; driver: string; contratto: string; domenica: string; riposo: string; ore: number };

export type EsitoVerifica = { richieste: Richiesta[]; settimane: SettimanaRiga[]; seiDomenica: SeiDomenica[]; nonVerificabili: string[] };

const GIORNI = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

/**
 * Controlli sulle ore del tracking, dal primo del mese fino a `finoA`.
 * Le settimane si guardano solo se complete (lunedì–domenica tutti coperti dal tracking e domenica ≤ finoA).
 */
export function verificaOre(persone: Persona[], coperti: Map<string, Set<string>>, p: { mese: string; finoA: string; dispatcher?: string[] }): EsitoVerifica {
  const da = `${p.mese}-01`;
  const disp = new Set((p.dispatcher ?? []).map(normName));
  const richieste: Richiesta[] = [], settimane: SettimanaRiga[] = [], seiDomenica: SeiDomenica[] = [];
  const nonVer = new Set<string>();
  let primoLun = da; while (weekday(primoLun) !== 0) primoLun = addDays(primoLun, -1);
  const lunedi: string[] = []; for (let l = primoLun; addDays(l, 6) <= p.finoA; l = addDays(l, 7)) lunedi.push(l);

  // Lo stesso lavoratore nel tracking STD e in quello SIC della stessa station: è l'anomalia più grave, perché le sue ore
  // finiscono due volte nei costi. Riconosciuto per codice fiscale, ID driver o nome (deciso da Alessandro il 25/11/2026).
  const visti = new Set<string>();
  for (const a of persone) {
    if (a.pop !== "STD") continue;
    for (const b of persone) {
      if (b.pop !== "SIC" || b.station !== a.station) continue;
      const perche = a.cf && a.cf === b.cf ? "stesso codice fiscale" : a.driverId.trim() && a.driverId.trim().toUpperCase() === b.driverId.trim().toUpperCase() ? "stesso ID driver" : normName(a.nome) && normName(a.nome) === normName(b.nome) ? "stesso nome" : null;
      const chi = a.cf || a.driverId || normName(a.nome);
      if (!perche || visti.has(`${a.station}|${chi}`)) continue;
      visti.add(`${a.station}|${chi}`);
      const nelMese = (q: Persona) => [...q.giorni.entries()].filter(([d, g]) => d >= da && d <= p.finoA && lav(g) > 0).map(([d]) => d);
      const insieme = nelMese(a).filter((d) => b.giorni.has(d) && lav(b.giorni.get(d)) > 0).sort();
      if (!nelMese(a).length || !nelMese(b).length) continue; // in uno dei due c'è solo la riga vuota: non conta
      richieste.push({
        chiave: `${p.mese}|${a.station}|STD+SIC|${chi}|DOPPIO|${p.mese}`, mese: p.mese, station: a.station, pop: "STD+SIC", driver: a.nome, tipo: "DOPPIO", rif: da, periodo: p.mese.split("-").reverse().join("/"),
        testo: `risulta sia nel tracking STD sia in quello SIC (${perche})${insieme.length ? `, con ore in tutti e due il ${insieme.map(ddmm).join(", ")}` : ", in giorni diversi"}: in quale dei due va tenuto?`,
        breve: `È sia nel tracking STD sia nel SIC${insieme.length ? ` (ore in tutti e due il ${insieme.map(ddmm).join(", ")})` : ""}: in quale va tenuto?`,
      });
    }
  }

  for (const x of persone) {
    const cop = coperti.get(`${x.station}|${x.pop}`) ?? new Set<string>();
    const c = leggiContratto(x.contratto);
    const dispatcher = c.tipo === "DISPATCHER" || nomeInElenco(disp, x.nome);
    const chi = x.cf || x.driverId || normName(x.nome);
    const nuova = (tipo: TipoRichiesta, rif: string, periodo: string, testo: string, breve: string) =>
      richieste.push({ chiave: `${p.mese}|${x.station}|${x.pop}|${chi}|${tipo}|${rif}`, mese: p.mese, station: x.station, pop: x.pop, driver: x.nome, tipo, rif, periodo, testo, breve });

    // 7 o più giorni di fila (anche a cavallo del mese, se c'è il tracking del mese prima)
    const lavorati = [...x.giorni.entries()].filter(([d, g]) => d <= p.finoA && lav(g) > 0).map(([d]) => d).sort();
    for (let i = 0; i < lavorati.length;) {
      let j = i; while (j + 1 < lavorati.length && addDays(lavorati[j], 1) === lavorati[j + 1]) j++;
      const n = j - i + 1;
      if (n >= 7 && lavorati[j] >= da) nuova("7GG", lavorati[i], `${ddmm(lavorati[i])}–${ddmm(lavorati[j])}`, `risultano ${n} giorni di lavoro di fila, dal ${ddmm(lavorati[i])} al ${ddmm(lavorati[j])}: è giusto?`, `${n} giorni di lavoro di fila: giusto?`);
      i = j + 1;
    }

    // Assenza segnata con la sigla ma senza ore: non è grave, ma senza le ore i conti della settimana non tornano
    for (const [d, sg] of x.sigle ?? []) if (d >= da && d <= p.finoA && chiediLeOre(x, c, d)) {
      const riga = SIGLE_ASSENZA[sg];
      nuova("ASS_ORE", d, ddmm(d), `il ${ddmm(d)} c'è «${sg}» nella riga RIPOSO ma mancano le ore nella riga ${riga}: riesci a inserirle?`, `«${sg}» senza ore: inserire le ore nella riga ${riga}`);
    }

    // Lo Standard oltre 8h24 in un giorno non si segnala più (deciso da Alessandro il 24/11/2026): conta solo che lo
    // Straordinario parta dopo le 39 ore di Standard e Supplementare della settimana.

    for (const l of lunedi) {
      const dd = Array.from({ length: 7 }, (_, i) => addDays(l, i));
      const periodo = `${ddmm(l)}–${ddmm(dd[6])}`;
      if (!dd.every((d) => cop.has(d))) { nonVer.add(`${x.station} ${x.pop}: settimana ${periodo} non verificabile, manca il tracking di una parte dei giorni`); continue; }
      const g = dd.map((d) => x.giorni.get(d));
      const s: OreGiorno = { std: 0, sup: 0, acc: 0, str: 0, ass: 0 };
      for (const o of g) if (o) { s.std += o.std; s.sup += o.sup; s.acc += o.acc; s.str += o.str; s.ass += o.ass; }
      // assenza scritta solo come sigla nella riga RIPOSO (es. F) senza ore: per il conto della settimana vale una giornata
      // (solo per decidere se lo Straordinario è lecito: non entra nel controllo "ore + assenze troppe" né nei totali mostrati)
      // Contano verso le 39 anche le assenze non retribuite: le ore scritte nelle loro righe e le sigle (sciopero, PNR) senza ore.
      const assSigle = dd.filter((d) => contaVerso39(x, c, d)).length * ORE_GIORNO_ASSENZA
        + g.reduce((a, o) => a + (o?.nr ?? 0), 0)
        + dd.filter((d) => { const sg = x.sigle?.get(d), o = x.giorni.get(d); return !!sg && SIGLE_NON_RETRIB.has(sg) && !(o && ((o.nr ?? 0) > 0 || lav(o) > 0)); }).length * ORE_GIORNO_ASSENZA;
      const tot = s.std + s.sup + s.acc + s.str, gg = g.filter((o) => lav(o) > 0).length;
      if (tot + s.ass === 0) continue;

      // 6 giorni lavorati con la domenica: da sapere prima della chiusura (non è una richiesta)
      if (gg === 6 && lav(g[6]) > 0) seiDomenica.push({ station: x.station, pop: x.pop, driver: x.nome, contratto: x.contratto, domenica: dd[6], riposo: GIORNI[g.findIndex((o) => lav(o) === 0)], ore: r1(tot) });

      let atteso: Riparto | null = null, esito = "ok";
      if (dispatcher) esito = "dispatcher: riparto non controllato";
      else {
        const tetto = tettoAccordo(dd[6]);
        // Le assenze retribuite possono contare o no verso le ore di contratto (dipende da come è compilato il tracking):
        // si segnala solo se il riparto non torna in nessuno dei due modi, e si propone quello più vicino.
        const pt = c.tipo === "PT";
        // Si guardano insieme le ore "ordinarie" (Standard + Supplementare + Accordo) e, a parte, lo Straordinario.
        // La riga Accordo va bene anche sotto le 39 ore (la mezz'ora in più del giorno è assorbita anche per part time e MOG:
        // deciso da Alessandro il 22/11/2026), purché non superi le ore assorbibili della settimana.
        const ord = s.std + s.sup + s.acc, ordDi = (a: Riparto) => a.std + a.sup + a.acc;
        const dist = (a: Riparto) => Math.abs(ord - ordDi(a)) + Math.abs(s.str - a.str);
        atteso = [ripartoAtteso(tot, s.ass, c, tetto), ripartoAtteso(tot, 0, c, tetto)].sort((x1, x2) => dist(x1) - dist(x2))[0];
        if (s.ass > 0 && tot + s.ass > tetto + 8) {
          // ore lavorate + assenze ben oltre una settimana piena: prima di spostare le ore va capito quale delle due è sbagliata
          esito = "ore + assenze troppe";
          nuova("ASSENZE", l, periodo, `Settimana ${periodo}: ${it(tot)} h lavorate + ${it(s.ass)} h di assenze fanno ${it(tot + s.ass)} h, mi sembrano tante. Sono giuste le ore o le assenze?`, `${it(tot)} h lavorate + ${it(s.ass)} h di assenze = ${it(tot + s.ass)} h: giusto?`);
        } else {
          const diff: string[] = [];
          // frasi per l'OS: dirette, con il giorno preciso da toccare (il riepilogo tecnico "diff" resta nel foglio Settimane)
          const frasi: string[] = [];
          // gli stessi punti in poche parole, uno per giorno: "12/11: 4 h Straordinario → Supplementare?"
          const brevi: string[] = [];
          const hh = (n: number) => `${it(r1(n))} h`;
          const ordinarie = pt ? "Supplementare" : "Standard";
          // DER2: i part time sono gestiti come MOG, quindi nel tracking Standard e Supplementare non sono distinti in modo affidabile.
          // Lì non si controlla il Supplementare: né lo Standard oltre le ore del part time, né il Supplementare su chi non è part time.
          const senzaSup = STATION_SENZA_SUPPLEMENTARE.has(x.station);
          const maxAcc = tetto - ORE_FT, maxStd = pt && c.ore !== null && !senzaSup ? c.ore : ORE_FT;
          // La riga Accordo può anche non essere compilata (deciso da Alessandro il 24/11/2026): dopo le 39 ore ordinarie
          // Il "sesto giorno" non fa eccezione (chiesto dagli OS, respinto da Alessandro con HR il 25/11/2026): senza le 39 ore non è Straordinario.
          // le ore possono andare a Straordinario. È un errore solo lo Straordinario segnato PRIMA di arrivare a 39 ore.
          // Le 39 ore si contano su Standard (e Supplementare per i part time): l'Accordo già scritto resta dov'è e non conta
          // (deciso da Alessandro il 24/11/2026: "standard fino a 39 e il resto in straordinario"). Le assenze retribuite, se servono, contano.
          const strMax = Math.max(0, tot - s.acc - Math.max(ORE_FT - s.ass - assSigle, 0));
          // Straordinario "di giornata": le ore oltre l'ottava lavorate nello stesso giorno possono stare in Straordinario anche se la
          // settimana non arriva a 39 (caso tipico dei part time; deciso da Alessandro il 24/11/2026). Vale per tutti i contratti.
          const strGiorno = g.reduce((a, o) => a + (o ? Math.min(o.str, Math.max(0, lav(o) - ORE_GIORNO_STR)) : 0), 0);
          const strLecito = Math.min(s.str, strMax + strGiorno);
          const strTroppo = s.str > strLecito + TOLLERANZA, strPoco = s.str < atteso.str - TOLLERANZA;
          const supNonPt = !pt && !senzaSup && s.sup > TOLLERANZA, stdOltre = s.std > maxStd + TOLLERANZA, accOltre = s.acc > maxAcc + TOLLERANZA;
          // proposta coerente: le ore che mancano per arrivare a 39 ordinarie (Standard, Supplementare e Accordo già scritto) passano dallo Straordinario allo Standard
          if (strTroppo) { const sposta = s.str - strLecito; diff.push(`${it(sposta)} h da Straordinario a ${pt ? "Supplementare" : "Standard"}: Straordinario ${it(s.str)} → ${it(strLecito)}, ${pt ? "Standard e Supplementare" : "Standard"} ${it(s.std + s.sup)} → ${it(s.std + s.sup + sposta)}`);
            // lo Straordinario "di troppo" è quello dei primi giorni in cui compare (tolte le ore oltre l'ottava di quel giorno)
            let resta = sposta; const pezzi: string[] = [];
            dd.forEach((d, k) => { const o = g[k]; if (!o || resta <= TOLLERANZA) return; const cand = o.str - Math.min(o.str, Math.max(0, lav(o) - ORE_GIORNO_STR)); const w = Math.min(cand, resta); if (w <= TOLLERANZA) return; resta -= w;
              brevi.push(w >= o.str - TOLLERANZA ? `${ddmm(d)}: Straordinario ${hh(o.str)} → ${ordinarie}?` : `${ddmm(d)}: Straordinario ${hh(o.str)}, di cui ${hh(w)} → ${ordinarie}?`);
              pezzi.push(w >= o.str - TOLLERANZA ? `il ${ddmm(d)} ci sono ${hh(o.str)} in Straordinario, ma secondo me sono ${ordinarie}` : `il ${ddmm(d)} ci sono ${hh(o.str)} in Straordinario, ma secondo me ${hh(w)} ${Math.abs(w - 1) < TOLLERANZA ? "è" : "sono"} ${ordinarie}`); });
            frasi.push(pezzi.join("; "));
          }
          // Standard oltre le 39 ore di un non part time: le ore in più vanno TUTTE in Straordinario, non divise con l'Accordo
          // (deciso da Alessandro il 24/11/2026: "se ha fatto le 39 ore, la domenica va tutta in straordinario").
          else if (stdOltre && !pt) { /* la riga qui sotto dice già tutto */ }
          else if (strPoco) { diff.push(`Straordinario ${it(s.str)} → ${it(atteso.str)}`, `Standard${pt ? ", Supplementare" : ""} e Accordo insieme ${it(ord)} → ${it(ordDi(atteso))}`); frasi.push(`con ${hh(tot)} lavorate mi aspettavo ${hh(atteso.str)} in Straordinario, ne vedo ${hh(s.str)}`); brevi.push(`${hh(tot)} lavorate: Straordinario atteso ${hh(atteso.str)}, segnato ${hh(s.str)}`); }
          if (supNonPt) { diff.push(`Supplementare ${it(s.sup)} → 0`); frasi.push(`${dd.flatMap((d, k) => (g[k]?.sup ? [`il ${ddmm(d)} ci sono ${hh(g[k]!.sup)} in Supplementare`] : [])).join("; ")}, ma non è un part time: secondo me sono Standard`); dd.forEach((d, k) => { if (g[k]?.sup) brevi.push(`${ddmm(d)}: Supplementare ${hh(g[k]!.sup)} → Standard? (non è part time)`); }); }
          if (stdOltre && !pt) { const inPiu = s.std - maxStd; diff.push(`${it(inPiu)} h da Standard a Straordinario: Standard ${it(s.std)} → ${it(maxStd)}, Straordinario ${it(s.str)} → ${it(s.str + inPiu)}`); }
          else if (stdOltre) diff.push(`Standard ${it(s.std)} → ${it(maxStd)} (il resto in Supplementare)`);
          if (stdOltre) {
            const dove = pt ? "Supplementare" : "Straordinario"; let cum = 0; const pezzi: string[] = [];
            dd.forEach((d, k) => { const o = g[k]; if (!o?.std) return; const prima = cum; cum += o.std; const w = Math.max(0, cum - Math.max(maxStd, prima)); if (w <= TOLLERANZA) return;
              brevi.push(w >= o.std - TOLLERANZA ? `${ddmm(d)}: Standard ${hh(o.std)} → ${dove}?` : `${ddmm(d)}: Standard ${hh(o.std)}, di cui ${hh(w)} → ${dove}?`);
              pezzi.push(w >= o.std - TOLLERANZA ? `le ${hh(o.std)} di Standard del ${ddmm(d)} secondo me vanno in ${dove}` : `il ${ddmm(d)} ci sono ${hh(o.std)} in Standard, ma secondo me ${hh(w)} ${Math.abs(w - 1) < TOLLERANZA ? "va" : "vanno"} in ${dove}`); });
            frasi.push(pezzi.join("; "));
          }
          if (accOltre) { diff.push(`Accordo ${it(s.acc)} → al massimo ${it(maxAcc)}`); frasi.push(`nella riga Accordo ci sono ${hh(s.acc)}, mi sembrano tante: è giusto?`); brevi.push(`Accordo ${hh(s.acc)} in settimana: giusto?`); }
          if (diff.length) {
            esito = diff.join(" · ");
            const altro: [TipoRichiesta, string] | null =
              supNonPt ? ["SUP", "il Supplementare è solo per i part time"]
              : strTroppo ? ["STR_PRIMA", `lo Straordinario parte solo dopo ${ORE_FT} ore di ${pt ? "Standard e Supplementare" : "Standard"} nella settimana`]
              : stdOltre ? ["STD_OLTRE", pt ? "nella riga Standard vanno solo le ore di contratto" : `nella riga Standard vanno al massimo ${ORE_FT} ore a settimana: quelle in più sono Straordinario`]
              : accOltre ? ["RIPARTO", `nella riga Accordo vanno al massimo ${it(maxAcc)} ore a settimana`]
              : strPoco ? ["RIPARTO", `oltre le ${tetto} ore della settimana le ore sono Straordinario`]
              : null;
            const frase = frasi.join(". ");
            if (altro) nuova(altro[0], l, periodo, `Settimana ${periodo}, lavorate ${it(tot)} h${s.ass ? ` + ${it(s.ass)} h di assenze` : ""} (${x.contratto || "contratto non indicato"}): ${frase.charAt(0).toLowerCase() + frase.slice(1)}.`, brevi.join(" · "));
          }
        }
        if (s.str > STR_MAX_SETT + 0.01) nuova("STR_SETT", l, periodo, `Settimana ${periodo}: ci sono ${it(s.str)} h di Straordinario, mi sembrano tante. È giusto?`, `Straordinario ${it(s.str)} h in settimana: giusto?`);
      }
      settimane.push({ station: x.station, pop: x.pop, driver: x.nome, contratto: x.contratto, lunedi: l, periodo, giorniLavorati: gg, std: r1(s.std), sup: r1(s.sup), acc: r1(s.acc), str: r1(s.str), ass: r1(s.ass), tot: r1(tot), atteso, esito });
    }
  }
  return { richieste, settimane, seiDomenica, nonVerificabili: [...nonVer].sort() };
}

/** gli stessi punti in poche parole, per la tabellina */
const IN_BREVE = {
  "+1": () => "Trasferta senza rotta Amazon: cosa ha fatto?",
  "-1": (ore: number, pacchi: number | null) => `In rotta su Amazon${pacchi ? ` (${pacchi} pacchi)` : ""}, 0 ore a tracking: manca la giornata?`,
  H: (ore: number) => `${it(ore)} h a tracking, non è su Amazon: cosa ha fatto?`,
  A: (ore: number, pacchi: number | null) => `In rotta su Amazon${pacchi ? ` (${pacchi} pacchi)` : ""}, non è nei tracking: prestito, nuovo assunto o errore?`,
};

const CHIEDI: Record<"+1" | "-1" | "H" | "A", string> = {
  "+1": "ha la trasferta ma Amazon non lo vede in rotta: cosa ha fatto?",
  "-1": "Amazon lo vede in rotta ma nel tracking ha 0 ore: manca la giornata",
  H: "ha ore nel tracking ma non è su Amazon, senza trasferta né giustificativo: cosa ha fatto?",
  A: "è in rotta su Amazon ma non lo trovo nei tracking della station: è un prestito, un nuovo assunto o un errore?",
};

/** Le anomalie del controllo tracking vs Amazon (+1, −1, H, A, ORE, ACC) come richieste, una per driver e giorno. */
export function richiesteDaAmazon(e: EsitoSettimanale, mese: string): Richiesta[] {
  const out: Richiesta[] = [];
  for (const r of e.dettaglio) {
    const chi = r.driverId.startsWith("NOID|") ? normName(r.driver) : r.driverId;
    for (const cat of alertDelGiorno(r)) {
      const tipo = cat as TipoRichiesta;
      // L'Accordo di domenica dei somministrati non diventa una richiesta per gli OS: lo guarda Alessandro (deciso il 24/11/2026).
      if (tipo === "ACC") continue;
      const nota = tipo === "ORE" ? r.extra.find((x) => x.cat === tipo)?.nota ?? "" : r.nota;
      const base = tipo === "+1" || tipo === "-1" || tipo === "H" ? CHIEDI[tipo] : "";
      out.push({ chiave: `${mese}|${e.station}|${r.tipo}|${chi}|${tipo}|${r.data}`, mese, station: e.station, pop: r.tipo, driver: r.driver, tipo, rif: r.data, periodo: ddmm(r.data),
        // +1, −1, H: frase diretta con i numeri tra parentesi; ORE: la nota del controllo (ore del giorno o valore anomalo)
        testo: base ? `il ${ddmm(r.data)} ${base} (tracking ${it(r.ore)} h${r.pacchi !== null && r.pacchi !== undefined ? `, Amazon ${r.pacchi} pacchi` : ""}).` : `il ${ddmm(r.data)}: ${nota}`,
        breve: tipo === "+1" || tipo === "-1" || tipo === "H" ? IN_BREVE[tipo](r.ore, r.pacchi ?? null) : `${nota}: giusto?` });
    }
  }
  // ID di un altro driver dentro il blocco: una richiesta per driver (grave: le ore finiscono alla persona sbagliata)
  for (const a of e.anomalie) if (a.codice === "ID_ALTRUI") out.push({ chiave: `${mese}|${e.station}|${a.file}|${normName(a.driver)}|ID|${mese}-01`, mese, station: e.station, pop: a.file, driver: a.driver, tipo: "ID", rif: `${mese}-01`, periodo: mese.split("-").reverse().join("/"),
    testo: `${a.anomalia}. Riesci a sistemare gli ID nel tracking?`, breve: a.breve ?? "Nel suo blocco c'è l'ID di un altro driver: va corretto" });
  for (const n of e.nonInTracking) if (n.categoria === "A") out.push({ chiave: `${mese}|${e.station}|AMAZON|${n.driverId}|A|${n.data}`, mese, station: e.station, pop: "AMAZON", driver: n.driver, tipo: "A", rif: n.data, periodo: ddmm(n.data), testo: `il ${ddmm(n.data)} ${CHIEDI.A} (Amazon ${n.pacchi} pacchi).`, breve: IN_BREVE.A(0, n.pacchi) });
  return out;
}

export type Stato = "DA_FARE" | "RICHIESTA" | "OK" | "RISOLTA";
export const ETICHETTA_STATO: Record<Stato, string> = { DA_FARE: "Da chiedere", RICHIESTA: "Chiesta, aspetto risposta", OK: "OK, chiusa", RISOLTA: "Sparita da sola" };

export type RichiestaSalvata = { chiave: string; stato: Stato; testo: string; breve?: string | null };

/**
 * Unisce le richieste appena trovate con quelle già salvate.
 * - nuova → DA_FARE; - già salvata → tiene lo stato (se era OK e il testo è cambiato si riapre);
 * - salvata ma non più trovata, in una station appena controllata → RISOLTA (gli OK restano OK).
 */
export function fondiRichieste(salvate: RichiestaSalvata[], trovate: Richiesta[], stationControllate: string[], mese: string) {
  const by = new Map(salvate.map((s) => [s.chiave, s]));
  const viste = new Set<string>();
  const crea: Richiesta[] = [], aggiorna: { chiave: string; stato: Stato; testo: string; breve?: string; riaperta: boolean }[] = [];
  for (const t of trovate) {
    if (viste.has(t.chiave)) continue;
    viste.add(t.chiave);
    const s = by.get(t.chiave);
    if (!s) { crea.push(t); continue; }
    const cambiato = s.testo !== t.testo;
    if (s.stato === "RISOLTA") aggiorna.push({ chiave: t.chiave, stato: "DA_FARE", testo: t.testo, breve: t.breve, riaperta: true });
    else if (s.stato === "OK" && cambiato) aggiorna.push({ chiave: t.chiave, stato: "DA_FARE", testo: t.testo, breve: t.breve, riaperta: true });
    // il testo breve è solo un altro modo di scrivere lo stesso punto: se cambia solo quello, lo stato non si tocca
    else if (cambiato || (s.breve ?? "") !== t.breve) aggiorna.push({ chiave: t.chiave, stato: s.stato, testo: t.testo, breve: t.breve, riaperta: false });
  }
  const ambito = new Set(stationControllate);
  for (const s of salvate) {
    const [m, st] = s.chiave.split("|");
    if (m === mese && ambito.has(st) && !viste.has(s.chiave) && (s.stato === "DA_FARE" || s.stato === "RICHIESTA")) aggiorna.push({ chiave: s.chiave, stato: "RISOLTA", testo: s.testo, riaperta: false });
  }
  return { crea, aggiorna };
}
