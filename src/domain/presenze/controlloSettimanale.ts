/**
 * Controllo settimanale: tracking (STD + SIC) vs CSV Amazon.
 *
 * Due livelli:
 * 1. esito BASE: porting fedele di controllo_trasferte_v2.py (Esito OK /
 *    ALERT +1 / ALERT -1 / CHECK formula / N/D con categoria A…I) — è ciò che il
 *    test golden confronta con attesi/Controllo_trasferte_<DS>_ott26.xlsx;
 * 2. CATEGORIA finale per gli Ops (+1, -1, H, A, ok, ?), con le regole nuove:
 *    dispatcher esclusi, giustificativi della riga RIPOSO e dei commenti di
 *    cella, ricerca del driver in tutti i tracking e CSV caricati (prestiti).
 */
import { addDays, at, daysBetween, g, GG, num, text, type Cell } from "./grid";
import { type FlexRow } from "./flex";
import {
  ALTRADS_V2,
  IND_EUR,
  NONGUIDA_V2,
  normName,
  okId,
  SOGLIA_ORE,
  SOGLIA_PACCHI,
  type Station,
} from "./regole";
import { cellNote, findTrackingSheet, headerCol, isFormula, trackingBlocks, type TrackingSheet } from "./tracking";
import type { SheetGrid } from "./grid";

const WORK = new Set(["standard", "straordinario", "supplementare", "accordo (dalla ora 39 a 44)"]);
const ABS = new Set([
  "ferie", "rol", "exf", "104", "assenza ingiust.", "assenza ingiustificata", "permesso sindacale",
  "altri permessi (104, cong. par)", "altri permesssi (104, cong. par)", "altri permessi (cong. par)",
  "permesso non retribuito", "malattia", "infortunio",
]);

export type TipoFile = "STD" | "SIC";

/** Un file tracking già letto: fogli in formato neutro + popolazione e station. */
export type TrackingInput = { station: Station; tipo: TipoFile; fileName: string; sheets: SheetGrid[] };

type Rec = {
  ore_lav?: number;
  ore_ass?: number;
  totali_file?: number;
  riposo?: string;
  trasf_file?: number;
  trasf_formula?: boolean;
  trasf_trk?: number;
  note?: string[]; // commenti di cella del giorno
};

type Info = { nome: string; cf: string; contratto: string; tipo: string; riga: number; id: string };

export type Anomalia = { file: string; riga: number | ""; driver: string; anomalia: string };

export type EsitoBase = "OK" | "ALERT +1" | "ALERT -1" | "CHECK formula" | "N/D";
export type Categoria = "+1" | "-1" | "H" | "A" | "ok" | "?" | "";

/** Una riga driver × giorno (foglio Dettaglio). */
export type RisultatoGiorno = {
  station: Station;
  tipo: string; // STD | SIC | STD+SIC | AMAZON
  driver: string;
  driverId: string;
  contratto: string;
  data: string;
  giorno: string;
  ore: number;
  oreAssenza: number;
  trasferta: number; // trasferta del tracking (ricalcolata se a formula)
  trasfRicalcolata: number;
  pacchi: number | null;
  match: "" | "ID" | "NOME" | "NOME~";
  riposo: string;
  inRotta: number;
  esitoBase: EsitoBase;
  categoriaBase: string;
  notaBase: string;
  categoria: Categoria;
  nota: string;
  noteCelle: string;
};

export type ParametriSettimanale = {
  station: Station;
  da: string;
  a: string;
  sogliaPacchi?: number;
  sogliaOre?: number;
  /** codici della riga RIPOSO che chiudono il giorno (regole nuove) */
  giustificativi?: string[];
  /** dispatcher (cognome nome, ordine indifferente): esclusi da ogni alert */
  dispatcher?: string[];
};

// ------------------------------------------------------------------ tracking (v2)

function parseTrackingV2(input: TrackingInput, p: { da: string; a: string; sogliaOre: number }, amIds: Set<string>) {
  const [yy, mmFrom] = p.da.split("-").map(Number);
  const mmTo = Number(p.a.split("-")[1]);
  const mese = mmFrom !== mmTo ? mmTo : mmFrom;
  const anno = mmFrom !== mmTo ? Number(p.a.split("-")[0]) : yy;
  const ts: TrackingSheet = findTrackingSheet(input.sheets, anno, mese);
  const tipoFile = input.tipo;
  const idc = headerCol(ts, ["driver id", "id"], 11);
  const namec = headerCol(ts, ["lavoratore", "driver"], 11);
  const cfc = headerCol(ts, ["codice fiscale"], 11);
  const contrc = headerCol(ts, ["tipo contratto"], 11);
  if (idc === null || namec === null || contrc === null) {
    throw new Error(`intestazione non riconosciuta (servono Driver ID, Lavoratore, Tipo contratto): ${ts.header.slice(0, 11).join(", ")}`);
  }
  const rows = new Map<string, Map<string, Rec>>();
  const info = new Map<string, Info>();
  const anomalie: Anomalia[] = [];
  const recOf = (k: string, d: string) => {
    let m = rows.get(k);
    if (!m) rows.set(k, (m = new Map()));
    let r = m.get(d);
    if (!r) m.set(d, (r = {}));
    return r;
  };
  const cell = (r: number, c: number): Cell => at(ts.grid, r, c);

  for (const b of trackingBlocks(ts)) {
    const r0 = b.rows[0];
    const nome = text(cell(r0, namec)).trim();
    const ids = b.rows.filter((r) => okId(cell(r, idc))).map((r) => text(cell(r, idc)).trim().toUpperCase());
    const id0 = okId(cell(r0, idc)) ? text(cell(r0, idc)).trim().toUpperCase() : null;
    const uniq = [...new Set(ids)];
    const inAm = uniq.filter((i) => amIds.has(i));
    let did: string | null = inAm.length === 1 ? inAm[0] : id0 ?? (ids.length ? mostCommon(ids) : null);
    if (!did) {
      did = "NOID|" + normName(nome);
      anomalie.push({ file: tipoFile, riga: r0 + 1, driver: nome, anomalia: "Driver ID mancante" });
    } else if (uniq.length > 1) {
      anomalie.push({ file: tipoFile, riga: r0 + 1, driver: nome, anomalia: `ID diversi nello stesso blocco: ${uniq.sort().join(", ")}` });
    }
    const k = `${tipoFile}|${did}`;
    if (info.has(k)) anomalie.push({ file: tipoFile, riga: r0 + 1, driver: nome, anomalia: `Driver duplicato nel file (ID ${did})` });
    info.set(k, {
      nome,
      cf: cfc !== null ? text(cell(r0, cfc)) : "",
      contratto: text(cell(r0, contrc)),
      tipo: tipoFile,
      riga: r0 + 1,
      id: did,
    });
    for (const r of b.rows) {
      const tl = text(cell(r, ts.tipoCol)).trim().toLowerCase();
      for (const { col, date } of ts.dayCols) {
        const v = cell(r, col);
        let x = num(v);
        const rec = recOf(k, date);
        if (WORK.has(tl) || ABS.has(tl) || tl === "totali") {
          if (x > 24) {
            if (p.da <= date && date <= p.a) {
              anomalie.push({ file: tipoFile, riga: r + 1, driver: nome, anomalia: `Valore anomalo ${g(x)} h il ${ddmm(date)} riga ${tl} (cella collegata a file esterno?) - ignorato` });
            }
            x = 0;
          }
        }
        if (WORK.has(tl)) rec.ore_lav = (rec.ore_lav ?? 0) + x;
        else if (ABS.has(tl)) rec.ore_ass = (rec.ore_ass ?? 0) + x;
        else if (tl === "totali") rec.totali_file = x;
        else if (tl === "riposo") {
          if (v !== null && v !== "" && v !== " ") rec.riposo = text(v).trim();
        } else if (tl === "indennità trasferta") {
          rec.trasf_file = x;
          rec.trasf_formula = isFormula(ts, r, col);
        }
        const nt = cellNote(ts, r, col);
        if (nt) (rec.note ??= []).push(nt.replace(/\s+/g, " ").trim());
      }
    }
  }
  let stale = 0;
  let manual = 0;
  const mdrv = new Set<string>();
  for (const [k, days] of rows) {
    for (const rec of days.values()) {
      if (rec.trasf_formula === undefined) continue;
      const calc = (rec.ore_lav ?? 0) > p.sogliaOre ? 1 : 0;
      if (rec.trasf_formula) {
        if (Math.trunc(rec.trasf_file ?? 0) !== calc) stale++;
        rec.trasf_trk = calc;
      } else {
        manual++;
        rec.trasf_trk = Math.trunc(rec.trasf_file ?? 0);
        mdrv.add(k);
      }
    }
  }
  if (stale) anomalie.push({ file: tipoFile, riga: "", driver: "(file)", anomalia: `${stale} celle "Indennità Trasferta" con formula il cui valore salvato non corrisponde alle ore (file non ricalcolato): usato il ricalcolo` });
  if (manual) anomalie.push({ file: tipoFile, riga: "", driver: "(file)", anomalia: `Info: ${manual} celle "Indennità Trasferta" scritte a mano su ${mdrv.size} driver (0 a mano = ignorato; 1 a mano senza ore/rotta = alert)` });
  return { rows, info, anomalie, foglio: ts.grid.name };
}

function mostCommon(a: string[]): string {
  const c = new Map<string, number>();
  for (const x of a) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((x, y) => y[1] - x[1])[0][0];
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// ------------------------------------------------------------------ controllo

type Am = { nome: string; pacchi: number };

export type EsitoSettimanale = {
  station: Station;
  da: string;
  a: string;
  dettaglio: RisultatoGiorno[];
  /** driver in Amazon (questa station) non trovati nei tracking: base del caso A */
  nonInTracking: { data: string; driver: string; driverId: string; pacchi: number; inRotta: number; categoria: Categoria; nota: string }[];
  idMancanti: { file: string; riga: number; driver: string; driverIdAmazon: string; esito: string }[];
  anomalie: Anomalia[];
  giorniCsv: string[];
  giorniSenzaCsv: string[];
  fogli: Record<string, string>;
};

/**
 * Esegue il controllo per una station sul periodo.
 * `altriTracking` = tracking delle altre station (per riconoscere i prestiti);
 * `flex` = righe Amazon di tutte le station caricate.
 */
export function controlloSettimanale(
  tracking: TrackingInput[],
  flex: FlexRow[],
  p: ParametriSettimanale,
  altriTracking: TrackingInput[] = [],
): EsitoSettimanale {
  const sogliaPacchi = p.sogliaPacchi ?? SOGLIA_PACCHI;
  const sogliaOre = p.sogliaOre ?? SOGLIA_ORE;
  const st = p.station;

  // Amazon della station: chiave ID|data (l'ultima riga vince, come lo script)
  const am = new Map<string, Am & { did: string; d: string }>();
  for (const r of flex) if (r.station === st) am.set(`${r.driverId}|${r.data}`, { nome: r.nome, pacchi: r.pacchi, did: r.driverId, d: r.data });
  if (am.size === 0) throw new Error(`nessuna riga Amazon per ${st}`);
  const amIds = new Set([...am.values()].map((a) => a.did));

  const own = tracking.filter((t) => t.station === st);
  for (const tag of ["STD", "SIC"] as const) {
    if (own.filter((t) => t.tipo === tag).length !== 1) throw new Error(`tracking ${tag} di ${st}: servono esattamente 1 file (trovati ${own.filter((t) => t.tipo === tag).length})`);
  }
  const allRows = new Map<string, Map<string, Rec>>();
  const allInfo = new Map<string, Info>();
  const anom: Anomalia[] = [];
  const fogli: Record<string, string> = {};
  for (const tipo of ["STD", "SIC"] as const) {
    const t = own.find((x) => x.tipo === tipo)!;
    const res = parseTrackingV2(t, { da: p.da, a: p.a, sogliaOre }, amIds);
    for (const [k, v] of res.rows) allRows.set(k, v);
    for (const [k, v] of res.info) allInfo.set(k, v);
    anom.push(...res.anomalie);
    fogli[tipo] = res.foglio;
  }
  // stesso ID in STD e SIC: ore unite
  const idsStd = new Set([...allInfo.keys()].filter((k) => k.startsWith("STD|")).map((k) => k.slice(4)));
  for (const k of [...allInfo.keys()].filter((k) => k.startsWith("SIC|"))) {
    const d = k.slice(4);
    if (!idsStd.has(d)) continue;
    anom.push({ file: "STD+SIC", riga: "", driver: allInfo.get(`STD|${d}`)!.nome, anomalia: `Stesso Driver ID ${d} in STD e SIC: ore unite` });
    const a = allRows.get(`STD|${d}`) ?? new Map();
    const b = allRows.get(`SIC|${d}`) ?? new Map();
    for (const date of new Set([...a.keys(), ...b.keys()])) {
      const ra = a.get(date) ?? {};
      const rb = b.get(date) ?? {};
      const sum = (f: keyof Rec) => ((ra[f] as number) ?? 0) + ((rb[f] as number) ?? 0);
      a.set(date, {
        ore_lav: sum("ore_lav"),
        ore_ass: sum("ore_ass"),
        totali_file: sum("totali_file"),
        trasf_file: Math.min(1, sum("trasf_file")),
        trasf_trk: Math.min(1, sum("trasf_trk")),
        riposo: ra.riposo || rb.riposo || "",
        note: [...(ra.note ?? []), ...(rb.note ?? [])],
      });
    }
    allRows.set(`STD|${d}`, a);
    allInfo.get(`STD|${d}`)!.tipo = "STD+SIC";
    allInfo.delete(k);
    allRows.delete(k);
  }

  const amByName = new Map<string, Am>();
  for (const a of am.values()) amByName.set(`${normName(a.nome)}|${a.d}`, a);
  const amNames = new Set([...am.values()].map((a) => normName(a.nome)));
  const fuzzy = (nome: string): string | null => {
    const w = new Set(normName(nome).split(" ").filter(Boolean));
    const n0 = normName(nome);
    const c = [...amNames].filter((n) => {
      const ns = n.split(" ");
      if (ns.length < 2 || n === n0) return false;
      const sub = (x: Set<string> | string[], y: Set<string>) => [...x].every((t) => y.has(t));
      return sub(ns, w) || (w.size >= 2 && sub(w, new Set(ns)));
    });
    return c.length === 1 ? c[0] : null;
  };

  const days = daysBetween(p.da, p.a);
  const amDays = [...new Set([...am.values()].map((a) => a.d).filter((d) => p.da <= d && d <= p.a))].sort();
  const missingCsv = days.filter((d) => !amDays.includes(d));

  const sortedInfo = [...allInfo.entries()].sort(([, x], [, y]) => cmpStr(x.tipo, y.tipo) || cmpStr(normName(x.nome), normName(y.nome)));
  const dettaglio: RisultatoGiorno[] = [];
  for (const [k, inf] of sortedInfo) {
    const did = inf.id;
    const recs = allRows.get(k) ?? new Map<string, Rec>();
    for (const d of days) {
      const rec = recs.get(d) ?? {};
      const ore = rec.ore_lav ?? 0;
      const ass = rec.ore_ass ?? 0;
      const tCalc = ore > sogliaOre ? 1 : 0;
      const tFile = Math.trunc(rec.trasf_trk ?? rec.trasf_file ?? 0);
      const manual0 = rec.trasf_formula !== undefined && !rec.trasf_formula && tFile === 0;
      const rip = (rec.riposo ?? "").trim().toUpperCase();
      const altraDs = ALTRADS_V2.test(rip);
      let a: Am | undefined = am.get(`${did}|${d}`);
      let via: RisultatoGiorno["match"] = "ID";
      if (!a) {
        a = amByName.get(`${normName(inf.nome)}|${d}`);
        via = a ? "NOME" : "";
      }
      if (!a) {
        const fz = fuzzy(inf.nome);
        if (fz) {
          a = amByName.get(`${fz}|${d}`);
          via = a ? "NOME~" : "";
        }
      }
      const pacchi = a ? a.pacchi : null;
      const flexIn = (pacchi ?? 0) > sogliaPacchi ? 1 : 0;
      let esito: EsitoBase = "OK";
      let nota = "";
      let cat = "";
      if (missingCsv.includes(d)) {
        esito = "N/D"; nota = "CSV Amazon mancante per questo giorno"; cat = "F. Giorno senza export Amazon";
      } else if (tFile === 1 && flexIn === 0) {
        esito = "ALERT +1";
        if (ass > 0 && ore === 0) { cat = "A. Trasferta su giorno di assenza"; nota = `${g(ass)} h di assenza e 0 h lavorate: la formula Totali include le assenze`; }
        else if (!a) { cat = "B. Driver non in Amazon"; nota = `Tracking ${g(ore)} h con trasferta, nessuna riga Amazon quel giorno: chiedere agli Operations`; }
        else { cat = "C. Sotto soglia pacchi"; nota = `Tracking ${g(ore)} h con trasferta, Amazon solo ${pacchi} pacchi (rescue/attivita non di consegna?)`; }
      } else if (tFile === 0 && flexIn === 1 && manual0 && ore > 0) {
        esito = "OK"; nota = `Trasferta 0 scritta a mano con ${g(ore)} h e ${pacchi} pacchi: considerata voluta`;
      } else if (tFile === 0 && flexIn === 1) {
        esito = "ALERT -1";
        if (ore > sogliaOre) { cat = "D. Ore >4 nel tracking ma trasferta 0 (formula)"; nota = `Tracking ${g(ore)} h, trasferta 0; Amazon ${pacchi} pacchi`; }
        else if (ore === sogliaOre) { esito = "OK"; nota = ""; }
        else if (ore > 0) { cat = "D3. Ore <4 nel tracking, Amazon in rotta"; nota = `Tracking solo ${g(ore)} h, Amazon ${pacchi} pacchi: ore probabilmente incomplete`; }
        else { cat = "D. Nessuna ora nel tracking, Amazon in rotta"; nota = `Amazon ${pacchi} pacchi, tracking 0 h: giornata mancante nel tracking`; }
      }
      if (esito === "ALERT +1" && NONGUIDA_V2.has(rip)) {
        esito = "OK"; cat = ""; nota = `Giustificativo ${rip} nel tracking: nessun alert`;
      } else if (esito === "ALERT +1" && altraDs) {
        esito = "OK"; cat = ""; nota = `Prestato ad altra station (${rip}): trasferta giustificata, verificare nel CSV di ${rip}`;
      } else if (esito === "ALERT +1" && rip === "RESCUE") {
        esito = "OK"; cat = ""; nota = "Rescue: indennita dovuta (art. 8b)";
      } else if (esito === "OK" && rip === "RESCUE" && tFile === 0 && ore > sogliaOre) {
        esito = "CHECK formula"; cat = "I. Rescue senza trasferta: indennita dovuta"; nota = `Codice RESCUE con ${g(ore)} h ma trasferta 0`;
      }
      if ((esito === "OK" || esito === "ALERT +1" || esito === "ALERT -1") && tFile === 1 && tCalc === 0) {
        nota = (nota ? nota + " | " : "") + `trasferta = 1 scritta a mano ma solo ${g(ore)} h lavorate`;
        if (esito === "OK") { esito = "CHECK formula"; cat = "E. Trasferta 1 scritta a mano con ore <=4"; }
      }
      dettaglio.push({
        station: st, tipo: inf.tipo, driver: inf.nome, driverId: did, contratto: inf.contratto, data: d, giorno: GG[(new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7],
        ore, oreAssenza: ass, trasferta: tFile, trasfRicalcolata: tCalc, pacchi, match: via, riposo: rip, inRotta: flexIn,
        esitoBase: esito, categoriaBase: cat, notaBase: nota, categoria: "", nota: "", noteCelle: (rec.note ?? []).join(" | "),
      });
    }
  }

  // ID mancanti nel tracking: proposti da Amazon
  const amNameIds = new Map<string, Set<string>>();
  for (const a of am.values()) {
    const n = normName(a.nome);
    if (!amNameIds.has(n)) amNameIds.set(n, new Set());
    amNameIds.get(n)!.add(a.did);
  }
  const idMancanti: EsitoSettimanale["idMancanti"] = [];
  for (const inf of allInfo.values()) {
    if (!inf.id.startsWith("NOID|")) continue;
    let ids = [...(amNameIds.get(normName(inf.nome)) ?? [])].sort();
    if (!ids.length) ids = [...(amNameIds.get(fuzzy(inf.nome) ?? "") ?? [])].sort();
    idMancanti.push({
      file: inf.tipo, riga: inf.riga, driver: inf.nome,
      driverIdAmazon: ids.length === 1 ? ids[0] : ids.join(" / "),
      esito: ids.length === 1 ? "trovato" : ids.length ? "ambiguo" : "NON trovato in Amazon",
    });
  }

  // Amazon non nei tracking della station
  const idsTrk = new Set([...allInfo.values()].map((i) => i.id));
  const namesTrk = new Set<string>([...allInfo.values()].map((i) => normName(i.nome)));
  for (const i of allInfo.values()) {
    const fz = fuzzy(i.nome);
    if (fz) namesTrk.add(fz);
  }
  const nonInTracking: EsitoSettimanale["nonInTracking"] = [...am.values()]
    .filter((a) => !idsTrk.has(a.did) && !namesTrk.has(normName(a.nome)) && p.da <= a.d && a.d <= p.a)
    .sort((x, y) => cmpStr(x.d, y.d) || cmpStr(x.did, y.did))
    .map((a) => ({ data: a.d, driver: a.nome, driverId: a.did, pacchi: a.pacchi, inRotta: a.pacchi > sogliaPacchi ? 1 : 0, categoria: "" as Categoria, nota: "" }));

  applicaRegoleNuove({ st, dettaglio, nonInTracking, flex, altriTracking, p, sogliaOre, sogliaPacchi });

  return { station: st, da: p.da, a: p.a, dettaglio, nonInTracking, idMancanti, anomalie: anom, giorniCsv: amDays, giorniSenzaCsv: missingCsv, fogli };
}

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ------------------------------------------------------------------ regole nuove (categorie per gli Ops)

/** Ore lavorate per driver e giorno in un tracking qualsiasi (per i prestiti tra station). */
type PresenzaAltrove = { station: Station; tipo: string; ore: number };

function indiceAltriTracking(altri: TrackingInput[], da: string, a: string): { byId: Map<string, PresenzaAltrove[]>; byName: Map<string, PresenzaAltrove[]> } {
  const byId = new Map<string, PresenzaAltrove[]>();
  const byName = new Map<string, PresenzaAltrove[]>();
  const push = (m: Map<string, PresenzaAltrove[]>, k: string, v: PresenzaAltrove) => {
    const l = m.get(k);
    if (l) l.push(v);
    else m.set(k, [v]);
  };
  for (const t of altri) {
    let res;
    try {
      res = parseTrackingV2(t, { da, a, sogliaOre: SOGLIA_ORE }, new Set());
    } catch {
      continue; // un tracking illeggibile non blocca il controllo della station
    }
    for (const [k, inf] of res.info) {
      for (const [d, rec] of res.rows.get(k) ?? []) {
        if (d < da || d > a || (rec.ore_lav ?? 0) <= 0) continue;
        const v = { station: t.station, tipo: t.tipo, ore: rec.ore_lav ?? 0 };
        if (!inf.id.startsWith("NOID|")) push(byId, `${inf.id}|${d}`, v);
        push(byName, `${normName(inf.nome)}|${d}`, v);
      }
    }
  }
  return { byId, byName };
}

const isDispatcher = (contratto: string, nome: string, dispatcher: Set<string>) =>
  /dispatcher/i.test(contratto) || dispatcher.has(normName(nome));

function giustificativo(riposo: string, noteCelle: string, codici: Set<string>): string | null {
  const rip = riposo.trim().toUpperCase();
  if (rip && codici.has(rip)) return rip;
  // commenti di cella: valgono se contengono un codice (es. "mezzi", "DLO4")
  const up = noteCelle.toUpperCase();
  for (const c of codici) if (c.length >= 3 && new RegExp(`(^|[^A-Z0-9])${c}([^A-Z0-9]|$)`).test(up)) return c;
  return null;
}

function applicaRegoleNuove(x: {
  st: Station;
  dettaglio: RisultatoGiorno[];
  nonInTracking: EsitoSettimanale["nonInTracking"];
  flex: FlexRow[];
  altriTracking: TrackingInput[];
  p: ParametriSettimanale;
  sogliaOre: number;
  sogliaPacchi: number;
}) {
  const codici = new Set((x.p.giustificativi ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean));
  const dispatcher = new Set((x.p.dispatcher ?? []).map(normName));
  const altri = indiceAltriTracking(x.altriTracking.filter((t) => t.station !== x.st), x.p.da, x.p.a);
  // rotte Amazon nelle ALTRE station, per ID e per nome
  const rottaAltrove = new Map<string, Station[]>();
  const presenteAltrove = new Map<string, Set<Station>>();
  for (const r of x.flex) {
    if (r.station === x.st || r.data < x.p.da || r.data > x.p.a) continue;
    if (!presenteAltrove.has(r.driverId)) presenteAltrove.set(r.driverId, new Set());
    presenteAltrove.get(r.driverId)!.add(r.station);
    if (r.pacchi <= x.sogliaPacchi) continue;
    for (const k of [`${r.driverId}|${r.data}`, `${normName(r.nome)}|${r.data}`]) {
      rottaAltrove.set(k, [...(rottaAltrove.get(k) ?? []), r.station]);
    }
  }

  for (const r of x.dettaglio) {
    if (r.esitoBase === "N/D") {
      r.categoria = "?";
      r.nota = "CSV Amazon mancante per questo giorno";
      continue;
    }
    if (isDispatcher(r.contratto, r.driver, dispatcher)) {
      r.categoria = "";
      if (r.esitoBase !== "OK" || r.ore > 0) r.nota = "Dispatcher: escluso dai controlli";
      continue;
    }
    const giust = giustificativo(r.riposo, r.noteCelle, codici);
    const altrove = rottaAltrove.get(`${r.driverId}|${r.data}`) ?? rottaAltrove.get(`${normName(r.driver)}|${r.data}`);
    const noteCella = r.noteCelle && !r.riposo ? ` (commento di cella: ${r.noteCelle})` : "";
    if (r.esitoBase === "ALERT +1" || (r.esitoBase === "CHECK formula" && r.categoriaBase.startsWith("E."))) {
      if (giust) { r.categoria = ""; r.nota = `Giustificativo ${giust}${noteCella}: nessun alert`; }
      else if (altrove) { r.categoria = ""; r.nota = `Rotta Amazon su ${[...new Set(altrove)].join(", ")}: prestito ad altra station`; }
      else { r.categoria = "+1"; r.nota = r.notaBase + (r.riposo ? ` | riga RIPOSO: ${r.riposo} (non è un giustificativo)` : ""); }
    } else if (r.esitoBase === "ALERT -1") {
      r.categoria = "-1";
      r.nota = r.notaBase;
    } else if (r.trasferta === 1 && r.inRotta === 1) {
      r.categoria = "ok";
      r.nota = r.notaBase;
    } else if (r.ore > 0 && r.pacchi === null && r.trasferta === 0) {
      if (giust) { r.categoria = ""; r.nota = `Giustificativo ${giust}${noteCella}`; }
      else if (altrove) { r.categoria = ""; r.nota = `Rotta Amazon su ${[...new Set(altrove)].join(", ")}: prestito ad altra station`; }
      else { r.categoria = "H"; r.nota = `${g(r.ore)} h nel tracking, nessuna riga Amazon, trasferta 0` + (r.riposo ? ` | riga RIPOSO: ${r.riposo}` : ""); }
    } else {
      r.categoria = "";
      r.nota = r.notaBase;
    }
  }

  // A: in Amazon con rotta, assente dai tracking della station
  for (const n of x.nonInTracking) {
    if (!n.inRotta) { n.categoria = ""; n.nota = "Sotto soglia pacchi: nessun alert"; continue; }
    const prest = altri.byId.get(`${n.driverId}|${n.data}`) ?? altri.byName.get(`${normName(n.driver)}|${n.data}`);
    if (prest?.length) {
      n.categoria = "";
      n.nota = `Prestito da ${prest.map((v) => `${v.station} ${v.tipo}`).join(", ")}: nel tracking con ${prest.map((v) => g(v.ore)).join("+")} h quel giorno`;
      continue;
    }
    n.categoria = "A";
    const other = [...(presenteAltrove.get(n.driverId) ?? [])].sort();
    n.nota = other.length ? `presente in Amazon anche su: ${other.join(", ")} → probabile prestito` : "nuovo assunto, dimesso o nome diverso nel tracking?";
  }
}

// ------------------------------------------------------------------ riepiloghi

export type RiepilogoTipo = {
  tipo: string; driver: number; trasferteTracking: number; giorniInRottaAmazon: number;
  alertPiu1: number; alertMeno1: number; trasf1AManoSenzaOre: number; eurPiu1: number; eurMeno1: number;
};

/** Riepilogo come lo script v2 (per tipo STD / SIC / TOT, esiti base). */
export function riepilogoBase(e: EsitoSettimanale): RiepilogoTipo[] {
  return (["STD", "SIC", "TOT"] as const).map((tipo) => {
    const sub = e.dettaglio.filter((r) => (tipo === "TOT" || r.tipo.includes(tipo)) && r.esitoBase !== "N/D");
    const p1 = sub.filter((r) => r.esitoBase === "ALERT +1").length;
    const m1 = sub.filter((r) => r.esitoBase === "ALERT -1").length;
    return {
      tipo, driver: new Set(sub.map((r) => r.driverId)).size,
      trasferteTracking: sub.reduce((s, r) => s + r.trasferta, 0),
      giorniInRottaAmazon: sub.reduce((s, r) => s + r.inRotta, 0),
      alertPiu1: p1, alertMeno1: m1,
      trasf1AManoSenzaOre: sub.filter((r) => r.esitoBase === "CHECK formula").length,
      eurPiu1: p1 * IND_EUR, eurMeno1: m1 * IND_EUR,
    };
  });
}

/** Una riga per driver (pagina e foglio Risultato), con i simboli per giorno. */
export type RigaDriver = {
  station: Station; tipo: string; driver: string; driverId: string; contratto: string;
  simboli: Record<string, Categoria>; giorniLavorati: number; trasferte: number; rotte: number;
  piu1: number; meno1: number; h: number; a: number; daVerificare: string; nota: string;
};

export function righePerDriver(e: EsitoSettimanale): RigaDriver[] {
  const by = new Map<string, RisultatoGiorno[]>();
  for (const r of e.dettaglio) {
    const k = `${r.tipo}|${r.driverId}|${r.driver}`;
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  const out: RigaDriver[] = [];
  for (const rs of by.values()) {
    const f = rs[0];
    const simboli: Record<string, Categoria> = {};
    for (const r of rs) simboli[r.data] = r.categoria;
    const alert = rs.filter((r) => ["+1", "-1", "H"].includes(r.categoria));
    out.push({
      station: e.station, tipo: f.tipo, driver: f.driver, driverId: f.driverId.startsWith("NOID|") ? "" : f.driverId, contratto: f.contratto,
      simboli, giorniLavorati: rs.filter((r) => r.ore > 0).length, trasferte: rs.reduce((s, r) => s + r.trasferta, 0),
      rotte: rs.reduce((s, r) => s + r.inRotta, 0),
      piu1: rs.filter((r) => r.categoria === "+1").length, meno1: rs.filter((r) => r.categoria === "-1").length,
      h: rs.filter((r) => r.categoria === "H").length, a: 0,
      daVerificare: alert.map((r) => `${Number(r.data.slice(8, 10))}(${r.categoria})`).join(", "),
      nota: [...new Set([
        ...(f.driverId.startsWith("NOID|") ? ["ID mancante nel tracking"] : []),
        ...rs.filter((r) => r.categoria === "" && r.nota.startsWith("Dispatcher")).slice(0, 1).map((r) => r.nota),
        ...alert.map((r) => r.nota).filter(Boolean).slice(0, 3),
      ])].join(" | "),
    });
  }
  // driver Amazon senza tracking (A): una riga per driver
  const byA = new Map<string, EsitoSettimanale["nonInTracking"]>();
  for (const n of e.nonInTracking) if (n.categoria === "A") byA.set(n.driverId, [...(byA.get(n.driverId) ?? []), n]);
  for (const ns of byA.values()) {
    const simboli: Record<string, Categoria> = {};
    for (const n of ns) simboli[n.data] = "A";
    out.push({
      station: e.station, tipo: "AMAZON", driver: ns[0].driver, driverId: ns[0].driverId, contratto: "",
      simboli, giorniLavorati: 0, trasferte: 0, rotte: ns.length, piu1: 0, meno1: 0, h: 0, a: ns.length,
      daVerificare: ns.map((n) => `${Number(n.data.slice(8, 10))}(A)`).join(", "), nota: ns[0].nota,
    });
  }
  return out.sort((x, y) => (y.piu1 + y.meno1 + y.h + y.a) - (x.piu1 + x.meno1 + x.h + x.a) || cmpStr(x.tipo, y.tipo) || cmpStr(x.driver, y.driver));
}

/** Per i test e gli export: giorni consecutivi lavorati più lunghi in una lista di date ISO. */
export function maxConsecutivi(dateLavorate: string[]): { n: number; dal: string; al: string } {
  const s = [...new Set(dateLavorate)].sort();
  let best = { n: 0, dal: "", al: "" };
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && addDays(s[i - 1], 1) !== s[i]) start = i;
    const n = i - start + 1;
    if (n > best.n) best = { n, dal: s[start], al: s[i] };
  }
  return best;
}
