/**
 * Buste paga: costo, voci variabili, ore e straordinari, ferie residue.
 * Mese = mese della busta. I soldi sono solo aggregati (station, mese, gruppo); per persona solo ore e ratei.
 */

export type Gruppo = "SIC" | "STD";
export type TotaleMese = { mese: string; station: string; gruppo: Gruppo; teste: number; lordo: number; tfr: number; impInps: number; senzaTotali: number };
export type VoceMese = { mese: string; station: string; gruppo: Gruppo; categoria: string; voce: string; importo: number; ore: number; persone: number };
export type OrePersona = { mese: string; station: string; gruppo: Gruppo; codice: string; nome: string; qualifica: string; oreLav: number | null; ggLav: number | null; oreStr: number; oreMagg: number };
export type RateiPersona = {
  mese: string; station: string; gruppo: Gruppo; codice: string; nome: string; qualifica: string; ferieUnita: "GG" | "ORE";
  ferieSaldo: number | null; ferieMatur: number | null; ferieGoduto: number | null; rolSaldo: number | null; exfestSaldo: number | null;
};

/**
 * Da (lordo di competenza + quota TFR) a costo azienda, tarato sui report paghe di settembre e ottobre 2026 (costo vero, SIC Amazon).
 * - COEFF_SENZA_RATEI_FERIE: contributi, INAIL e ratei di 13ª e 14ª. Il rateo di ferie e permessi si aggiunge a parte, calcolato
 *   dal maturato e dal goduto del mese (vedi rateoFerie): è la voce che fa ballare il costo da un mese all'altro.
 * - COEFF_COSTO_AZIENDA: tutto compreso, per i mesi e i gruppi in cui il rateo non si può calcolare (prima busta dell'anno, GLS).
 */
export const COEFF_SENZA_RATEI_FERIE = 1.37;
export const COEFF_COSTO_AZIENDA = 1.3;
export const COEFF_FONTE = "report paghe di settembre e ottobre 2026, tutte le station SIC";

/** Rateo di ferie e permessi di un mese e una station: valore del maturato meno valore del goduto (negativo quando si smaltiscono ferie). */
export type RateoFerie = { mese: string; station: string; gruppo: Gruppo; importo: number; persone: number };
type RateiMese = { codice: string; station: string; ferieMatur: number | null; ferieGoduto: number | null; rolMatur: number | null; rolGoduto: number | null; exfestMatur: number | null; exfestGoduto: number | null };
/** Quanto vale per l'azienda un giorno di ferie e un'ora di ROL o di ex festività di una persona (dall'anagrafica dei costi). */
export type ValoreAssenza = { ferieGg: number; rolH: number; exfH: number };

/**
 * Rateo del mese per station: per ogni persona (maturato − goduto) tra la busta di prima e questa, per il valore di un giorno
 * o di un'ora. Chi non è nell'anagrafica dei costi vale la media della sua station. Serve la busta del mese prima.
 */
export function rateoFerie(mese: string, ora: RateiMese[], prima: RateiMese[], valore: (station: string, codice: string) => ValoreAssenza | null): RateoFerie[] {
  const p = new Map(prima.map((x) => [`${x.station}|${x.codice}`, x]));
  const d = (a: number | null, b: number | null) => Math.max(0, (a ?? 0) - (b ?? 0)); // a gennaio i contatori ripartono: mai negativo
  const out = new Map<string, { importo: number; persone: number; senza: { fe: number; rol: number; exf: number }; n: number; somma: ValoreAssenza }>();
  for (const x of ora) {
    const o = p.get(`${x.station}|${x.codice}`);
    if (!o) continue;
    const s = out.get(x.station) ?? { importo: 0, persone: 0, senza: { fe: 0, rol: 0, exf: 0 }, n: 0, somma: { ferieGg: 0, rolH: 0, exfH: 0 } };
    const fe = d(x.ferieMatur, o.ferieMatur) - d(x.ferieGoduto, o.ferieGoduto), rol = d(x.rolMatur, o.rolMatur) - d(x.rolGoduto, o.rolGoduto), exf = d(x.exfestMatur, o.exfestMatur) - d(x.exfestGoduto, o.exfestGoduto);
    const v = valore(x.station, x.codice);
    if (v) { s.importo += fe * v.ferieGg + rol * v.rolH + exf * v.exfH; s.n++; s.somma.ferieGg += v.ferieGg; s.somma.rolH += v.rolH; s.somma.exfH += v.exfH; }
    else { s.senza.fe += fe; s.senza.rol += rol; s.senza.exf += exf; }
    s.persone++;
    out.set(x.station, s);
  }
  return [...out.entries()].filter(([, s]) => s.n > 0).map(([station, s]) => ({
    mese, station, gruppo: "SIC" as Gruppo, persone: s.persone,
    importo: Math.round((s.importo + (s.senza.fe * s.somma.ferieGg + s.senza.rol * s.somma.rolH + s.senza.exf * s.somma.exfH) / s.n) * 100) / 100,
  }));
}

/** Categorie che non sono costo del mese: anticipi per conto INPS (recuperati), voci pagate una volta (13ª/14ª, ferie liquidate, TFR liquidato). */
const NON_COMPETENZA = ["ANTICIPI_INPS", "MENSILITA", "FERIE_LIQUIDATE", "FINE_RAPPORTO"];

export const CATEGORIE: { id: string; nome: string; spiegazione: string; tipo: "COMPETENZA" | "TRATTENUTA" | "INFO" }[] = [
  { id: "RETRIBUZIONE", nome: "Retribuzione", spiegazione: "paga base, EDR, ferie e permessi pagati", tipo: "COMPETENZA" },
  { id: "STRAORDINARI", nome: "Straordinari e supplementari", spiegazione: "ore in più pagate con maggiorazione", tipo: "COMPETENZA" },
  { id: "MAGGIORAZIONI", nome: "Maggiorazioni festive e notturne", spiegazione: "solo la maggiorazione su ore già pagate", tipo: "COMPETENZA" },
  { id: "TRASFERTE", nome: "Trasferte", spiegazione: "indennità di trasferta (esenti)", tipo: "COMPETENZA" },
  { id: "INDENNITA", nome: "Indennità", spiegazione: "cassa, flessibilità, turno spezzato, coordinamento, reperibilità…", tipo: "COMPETENZA" },
  { id: "PREMI", nome: "Premi e una tantum", spiegazione: "PDR, premi, una tantum, ticket", tipo: "COMPETENZA" },
  { id: "FESTIVITA", nome: "Festività non godute", spiegazione: "festività cadute di domenica o lavorate", tipo: "COMPETENZA" },
  { id: "MALATTIA_AZIENDA", nome: "Malattia e infortunio a carico azienda", spiegazione: "carenza e integrazioni pagate dall'azienda", tipo: "COMPETENZA" },
  { id: "MENSILITA", nome: "13ª e 14ª", spiegazione: "pagate nel mese (o rateo mensile per gli STD)", tipo: "COMPETENZA" },
  { id: "FERIE_LIQUIDATE", nome: "Ferie, ROL ed ex fest. liquidati", spiegazione: "pagati a chi esce o a fine mese (STD)", tipo: "COMPETENZA" },
  { id: "FINE_RAPPORTO", nome: "TFR liquidato e chiusure", spiegazione: "TFR a chi esce, transazioni, incentivi", tipo: "COMPETENZA" },
  { id: "RIMBORSI", nome: "Rimborsi spese", spiegazione: "", tipo: "COMPETENZA" },
  { id: "ALTRO", nome: "Altre voci", spiegazione: "", tipo: "COMPETENZA" },
  { id: "ANTICIPI_INPS", nome: "Anticipi per conto INPS/INAIL", spiegazione: "malattia, congedi: l'azienda li recupera, non sono costo", tipo: "INFO" },
  { id: "ASSENZE_NON_PAGATE", nome: "Assenze non pagate", spiegazione: "malattia c/INPS, permessi non retribuiti, sciopero, sospensioni (paga tolta)", tipo: "TRATTENUTA" },
  { id: "T_MULTE", nome: "Multe stradali trattenute", spiegazione: "infrazioni al codice della strada addebitate", tipo: "TRATTENUTA" },
  { id: "T_DANNI_DISCIPLINARI", nome: "Danni e provvedimenti disciplinari", spiegazione: "danni provocati, contestazioni, multe disciplinari", tipo: "TRATTENUTA" },
  { id: "T_ANTICIPI_ALTRE", nome: "Recupero anticipi e altre trattenute", spiegazione: "", tipo: "TRATTENUTA" },
  { id: "T_SINDACALI", nome: "Trattenute sindacali", spiegazione: "", tipo: "TRATTENUTA" },
  { id: "T_TERZI", nome: "Cessioni del quinto e pignoramenti", spiegazione: "girati a terzi", tipo: "TRATTENUTA" },
];
export const NOME_CATEGORIA = Object.fromEntries(CATEGORIE.map((c) => [c.id, c.nome]));

export type Costo = { teste: number; lordo: number; tfr: number; competenza: number; stimato: number | null };

/**
 * Costo di un insieme di righe: lordo di competenza = lordo − voci non di competenza; costo stimato solo per chi è dipendente (SIC, GLS).
 * Dove c'è il rateo ferie del mese si usa quello (più preciso), altrimenti il coefficiente tutto compreso.
 */
export function costo(tot: TotaleMese[], voci: VoceMese[], ratei: RateoFerie[] = []): Costo {
  const lordo = tot.reduce((a, t) => a + t.lordo, 0), tfr = tot.reduce((a, t) => a + t.tfr, 0), teste = tot.reduce((a, t) => a + t.teste, 0);
  const k = (x: { mese: string; station: string; gruppo: string }) => `${x.mese}|${x.station}|${x.gruppo}`;
  const togli = new Map<string, number>();
  for (const v of voci) if (v.voce === "" && NON_COMPETENZA.includes(v.categoria)) togli.set(k(v), (togli.get(k(v)) ?? 0) + v.importo);
  const rateo = new Map(ratei.map((r) => [k(r), r.importo]));
  let competenza = 0, stimato = 0;
  for (const t of tot) {
    const c = t.lordo - (togli.get(k(t)) ?? 0), r = rateo.get(k(t));
    competenza += c;
    stimato += r === undefined ? (c + t.tfr) * COEFF_COSTO_AZIENDA : (c + t.tfr) * COEFF_SENZA_RATEI_FERIE + r;
  }
  const soloDipendenti = tot.every((t) => t.gruppo === "SIC");
  return { teste, lordo, tfr, competenza, stimato: tot.length && soloDipendenti ? stimato : null };
}

/** Ore per station e mese (somma delle persone). */
export function orePerStation(ore: OrePersona[]) {
  const m = new Map<string, { mese: string; station: string; gruppo: Gruppo; persone: number; oreLav: number; oreStr: number; oreMagg: number; conStr: number }>();
  for (const o of ore) {
    const k = `${o.mese}|${o.station}|${o.gruppo}`;
    const x = m.get(k) ?? { mese: o.mese, station: o.station, gruppo: o.gruppo, persone: 0, oreLav: 0, oreStr: 0, oreMagg: 0, conStr: 0 };
    x.persone++; x.oreLav += o.oreLav ?? 0; x.oreStr += o.oreStr; x.oreMagg += o.oreMagg; if (o.oreStr > 0) x.conStr++;
    m.set(k, x);
  }
  return [...m.values()];
}

/** Chi fa più straordinari nei mesi scelti: ore in più, mesi in cui ne ha fatte, quota sulle ore lavorate. */
export function piuStraordinari(ore: OrePersona[], n = 30) {
  const m = new Map<string, { codice: string; nome: string; station: string; gruppo: Gruppo; oreStr: number; oreLav: number; mesi: number; mesiCon: number; max: number; meseMax: string }>();
  for (const o of ore) {
    const k = `${o.gruppo}|${o.codice}`;
    const x = m.get(k) ?? { codice: o.codice, nome: o.nome, station: o.station, gruppo: o.gruppo, oreStr: 0, oreLav: 0, mesi: 0, mesiCon: 0, max: 0, meseMax: o.mese };
    x.oreStr += o.oreStr; x.oreLav += o.oreLav ?? 0; x.mesi++; if (o.oreStr > 0) x.mesiCon++;
    if (o.oreStr > x.max) { x.max = o.oreStr; x.meseMax = o.mese; }
    if (o.mese >= x.meseMax || !x.station) x.station = o.station;
    m.set(k, x);
  }
  return [...m.values()].filter((x) => x.oreStr > 0).sort((a, b) => b.oreStr - a.oreStr).slice(0, n);
}

/** Soglie oltre le quali le ferie residue vanno smaltite: 15 giorni, o 120 ore per chi le ha in ore. */
export const SOGLIA_FERIE = { GG: 15, ORE: 120 } as const;

/** Ultima busta di ogni persona nel gruppo (chi è uscito resta con l'ultima busta: si guarda solo l'ultimo mese disponibile). */
export function ultimiRatei(r: RateiPersona[]) {
  const ultimo = new Map<string, string>();
  for (const x of r) { const k = `${x.station === "GLS" ? "GLS" : x.gruppo}`; if (!ultimo.has(k) || x.mese > ultimo.get(k)!) ultimo.set(k, x.mese); }
  return r.filter((x) => x.mese === ultimo.get(x.station === "GLS" ? "GLS" : x.gruppo));
}

/** Ferie residue per station e mese: somma dei saldi (nella loro unità) e persone oltre soglia. */
export function feriePerStation(r: RateiPersona[]) {
  const m = new Map<string, { mese: string; station: string; gruppo: Gruppo; unita: "GG" | "ORE"; persone: number; ferie: number; rol: number; exfest: number; oltre: number; negativi: number }>();
  for (const x of r) {
    const k = `${x.mese}|${x.station}|${x.gruppo}`;
    const y = m.get(k) ?? { mese: x.mese, station: x.station, gruppo: x.gruppo, unita: x.ferieUnita, persone: 0, ferie: 0, rol: 0, exfest: 0, oltre: 0, negativi: 0 };
    y.persone++; y.ferie += x.ferieSaldo ?? 0; y.rol += x.rolSaldo ?? 0; y.exfest += x.exfestSaldo ?? 0;
    if ((x.ferieSaldo ?? 0) > SOGLIA_FERIE[x.ferieUnita]) y.oltre++;
    if ((x.ferieSaldo ?? 0) < 0) y.negativi++;
    m.set(k, y);
  }
  return [...m.values()];
}

// ── Addebiti in busta: multe stradali, danni ai veicoli, provvedimenti disciplinari ──
export type TipoAddebito = "MULTA" | "DANNO" | "DISCIPLINARE";
export const NOME_ADDEBITO: Record<TipoAddebito, string> = { MULTA: "Multe stradali", DANNO: "Danni ai veicoli", DISCIPLINARE: "Multe disciplinari" };
export type Addebito = { mese: string; station: string; gruppo: Gruppo; codice: string; nome: string; tipo: TipoAddebito; voce: string; importo: number };

/** Per persona: totale per tipo, quante volte, primo e ultimo mese, dal più alto. */
export function addebitiPerPersona(a: Addebito[]) {
  const m = new Map<string, { codice: string; nome: string; station: string; gruppo: Gruppo; MULTA: number; DANNO: number; DISCIPLINARE: number; totale: number; volte: number; mesi: Set<string>; righe: Addebito[] }>();
  for (const x of a) {
    const k = `${x.gruppo}|${x.station}|${x.codice}`;
    const y = m.get(k) ?? { codice: x.codice, nome: x.nome, station: x.station, gruppo: x.gruppo, MULTA: 0, DANNO: 0, DISCIPLINARE: 0, totale: 0, volte: 0, mesi: new Set<string>(), righe: [] };
    y[x.tipo] += x.importo; y.totale += x.importo; y.volte++; y.mesi.add(x.mese); y.righe.push(x);
    m.set(k, y);
  }
  return [...m.values()].map((y) => ({ ...y, mesi: [...y.mesi].sort(), righe: y.righe.sort((p, q) => p.mese.localeCompare(q.mese)) })).sort((p, q) => q.totale - p.totale);
}
