/**
 * Controllo di fine mese SIC: ore tracking vs ore Zucchetti, più domeniche e
 * giorni consecutivi. Porting fedele di controllo_zucchetti.py.
 */
import { text, weekday, GG, type Cell, type SheetGrid } from "./grid";
import { ASSENZE_NON_RETRIB, ASSENZE_RETRIB, LAVORO, leggiLavoratori, matrKey, type Lavoratore } from "./lavoratori";
import { controlloDomenica, domenicheDelMese, giorniDelMese, type ControlloDomenica } from "./domeniche";
import { CITTA, STATIONS, type Station } from "./regole";

// ------------------------------------------------------------------ Zucchetti

export type ZucchettiLavoratore = { matr: string; nome: string; pt: Cell; giorni: Record<string, number> };
export type Zucchetti = { station: Station; lavoratori: Map<string, ZucchettiLavoratore> };

/** Nome normalizzato come nk() dello script (ascii, senza apostrofi, parole ordinate). */
export function nk(s: unknown): string {
  const t = String(s ?? "").normalize("NFKD").replace(/[^\x00-\x7F]/g, "").toLowerCase().replace(/['`]/g, "");
  return t.replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
}

/** Cella oraria Zucchetti (orario, "08:00", 7.8, frazione di giorno, "") → ore decimali. */
export function ore(v: Cell): number {
  if (v === null || v === undefined || v === "") return 0;
  if (v instanceof Date) return v.getUTCHours() + v.getUTCMinutes() / 60 + v.getUTCSeconds() / 3600;
  if (typeof v === "number") return v > 0 && v < 1 ? v * 24 : v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = String(v).trim();
  const m = /^(\d{1,2})[:.](\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) return Number(m[1]) + Number(m[2]) / 60 + (m[3] ? Number(m[3]) : 0) / 3600;
  const f = parseFloat(s.replace(",", "."));
  return Number.isFinite(f) && /^[+-]?[\d.]+$/.test(s.replace(",", ".")) ? f : 0;
}

/** Station dal nome file Zucchetti Amazon_<AAAA>_<MM>_<Città>_*.xlsm */
export function stationFromZucchettiName(fileName: string): Station | null {
  // solo lettere: "Sant'Arcangelo", "Sant Arcangelo", "SantArcangelo di Romagna" → SANTARCANGELO
  const up = fileName.toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "");
  const c = Object.keys(CITTA).find((k) => up.includes(k));
  if (c) return CITTA[c];
  return up.includes("RIMINI") ? "DER2" : null;
}

export function isZucchettiName(fileName: string): boolean {
  return /^amazon_\d{4}_\d{2}_/i.test(fileName) && stationFromZucchettiName(fileName) !== null;
}

/** Anno e mese dal nome Amazon_<AAAA>_<MM>_… */
export function meseFromZucchettiName(fileName: string): { anno: number; mese: number } | null {
  const m = /^amazon_(\d{4})_(\d{2})_/i.exec(fileName);
  return m ? { anno: Number(m[1]), mese: Number(m[2]) } : null;
}

const r2 = (x: number) => Math.round(x * 1e4) / 1e4;

export function leggiZucchetti(sheets: SheetGrid[], station: Station, anno: number, mese: number): Zucchetti {
  const g = sheets.find((s) => s.name === "ORARI") ?? sheets[0];
  if (!g) throw new Error("file vuoto");
  const hr = g.rows.slice(0, 5).findIndex((r) => (r ?? []).some((v) => text(v).trim().toUpperCase() === "MATR"));
  if (hr < 0) throw new Error('riga di intestazione con "MATR" non trovata nel foglio ORARI');
  const hdr = g.rows[hr] ?? [];
  const prefix = `${anno}-${String(mese).padStart(2, "0")}-`;
  const daymap: { col: number; date: string }[] = [];
  hdr.forEach((h, j) => {
    if (h instanceof Date) {
      const iso = `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, "0")}-${String(h.getUTCDate()).padStart(2, "0")}`;
      if (iso.startsWith(prefix)) daymap.push({ col: j, date: iso });
    } else if (typeof h === "number" && h >= 1 && h <= 31) {
      const d = giorniDelMese(anno, mese)[Math.trunc(h) - 1];
      if (d) daymap.push({ col: j, date: d });
    }
  });
  const out = new Map<string, ZucchettiLavoratore>();
  for (const r of g.rows.slice(hr + 1)) {
    if (!r || r.length < 7 || text(r[5] ?? null).trim().toUpperCase() !== "TOTALE") continue;
    const nome = `${text(r[2] ?? null)} ${text(r[3] ?? null)}`.trim();
    const k = matrKey(r[1]) || "NOME:" + nk(nome);
    const giorni: Record<string, number> = {};
    for (const { col, date } of daymap) if (col < r.length) giorni[date] = r2(ore(r[col] ?? null));
    out.set(k, { matr: k, nome, pt: r[4] ?? null, giorni });
  }
  return { station, lavoratori: out };
}

// ------------------------------------------------------------------ controllo

export type InputFineMese = {
  trackingSic: Partial<Record<Station, SheetGrid[]>>;
  trackingStd?: Partial<Record<Station, SheetGrid[]>>;
  zucchetti: Partial<Record<Station, SheetGrid[]>>;
  anno: number;
  mese: number;
};

export type RiepilogoFineMese = {
  station: Station; lavoratoriTracking: number; lavoratoriZucchetti: number; abbinati: number;
  soloTracking: number; soloZucchetti: number; giorniConDelta: number; deltaOreTot: number;
  oreTrackingTot: number; oreZucchettiTot: number;
};

export type DeltaGiorno = {
  station: Station; matricola: string; lavoratore: string; contratto: string; data: string; giorno: string;
  oreTracking: number; oreLavoro: number; oreAssenzeRetrib: number; oreAssenzeNonRetrib: number;
  oreZucchetti: number; delta: number; lettura: string; vociTracking: string;
};

export type NonAbbinato = { station: Station; fonte: "TRACKING" | "ZUCCHETTI"; matricola: string; lavoratore: string; cf: string; contratto: string; oreMese: number; nota: string };

export type CellaMatrice = { matricola: string; lavoratore: string; data: string; tracking: number; zucchetti: number; delta: number };

export type DomenicaRiga = { station: Station; lavoratore: Lavoratore; check: ControlloDomenica };

export type EsitoFineMese = {
  anno: number;
  mese: number;
  riepilogo: RiepilogoFineMese[];
  delta: DeltaGiorno[];
  nonAbbinati: NonAbbinato[];
  matrici: Partial<Record<Station, CellaMatrice[]>>;
  domSic: DomenicaRiga[];
  domStd: DomenicaRiga[];
  /** per station e domenica: nomi con 6+dom (foglio "Tabella 6+domenica (SIC)") */
  tabellaSeiPiuDom: Partial<Record<Station, Record<number, string[]>>>;
  /** lavoratori con ≥7 giorni consecutivi */
  consecutivi: { station: Station; tipo: "SIC" | "STD"; lavoratore: string; dal: string; al: string; giorni: number }[];
  mancanti: string[];
};

const fmt = (x: number) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 1e6) / 1e6));

export function controlloFineMese(input: InputFineMese): EsitoFineMese {
  const { anno, mese } = input;
  const giorniMese = giorniDelMese(anno, mese);
  const riepilogo: RiepilogoFineMese[] = [];
  const delta: DeltaGiorno[] = [];
  const nonAbbinati: NonAbbinato[] = [];
  const matrici: EsitoFineMese["matrici"] = {};
  const domSicL: { station: Station; l: Lavoratore }[] = [];
  const mancanti: string[] = [];

  for (const st of STATIONS) {
    const trkSheets = input.trackingSic[st];
    if (!trkSheets) { mancanti.push(`${st}: manca tracking SIC`); continue; }
    const lav = leggiLavoratori(trkSheets, anno, mese).lavoratori;
    for (const w of lav) domSicL.push({ station: st, l: w });
    const zSheets = input.zucchetti[st];
    if (!zSheets) { mancanti.push(`${st}: manca file Zucchetti`); continue; }
    const Z = leggiZucchetti(zSheets, st, anno, mese).lavoratori;
    const zByName = new Map<string, string>();
    for (const [k, z] of Z) zByName.set(nk(z.nome), k);
    const trova = (w: Lavoratore): string | null => {
      if (w.matricola && Z.has(w.matricola)) return w.matricola;
      const n = nk(w.nome);
      if (zByName.has(n)) return zByName.get(n)!;
      const tok = new Set(n.split(" ").filter(Boolean));
      if (tok.size >= 2) {
        const cand = [...Z.entries()].filter(([, z]) => {
          const zt = new Set(nk(z.nome).split(" ").filter(Boolean));
          return [...tok].every((t) => zt.has(t)) || [...zt].every((t) => tok.has(t));
        }).map(([k]) => k);
        if (cand.length === 1) return cand[0];
      }
      return null;
    };
    const usati = new Set<string>();
    let nMatch = 0, dTot = 0, nGgDelta = 0;
    const mat: CellaMatrice[] = [];
    for (const w of lav) {
      const k = trova(w);
      if (k === null) {
        const tot = Object.values(w.giorni).reduce((s, v) => s + Object.values(v).reduce((a, b) => a + (b ?? 0), 0), 0);
        nonAbbinati.push({ station: st, fonte: "TRACKING", matricola: w.matricola, lavoratore: w.nome, cf: w.cf, contratto: w.contratto, oreMese: Math.round(tot * 100) / 100, nota: "non trovato su Zucchetti (né matricola né nome)" });
        continue;
      }
      usati.add(k); nMatch++;
      const z = Z.get(k)!;
      for (const d of giorniMese) {
        const voci = w.giorni[d] ?? {};
        const lavoro = LAVORO.reduce((s, v) => s + (voci[v] ?? 0), 0);
        const assret = ASSENZE_RETRIB.reduce((s, v) => s + (voci[v] ?? 0), 0);
        const assnr = ASSENZE_NON_RETRIB.reduce((s, v) => s + (voci[v] ?? 0), 0);
        const trk = r2(lavoro + assret + assnr);
        const zz = z.giorni[d] ?? 0;
        const dl = r2(trk - zz);
        mat.push({ matricola: k, lavoratore: w.nome, data: d, tracking: trk, zucchetti: zz, delta: dl });
        if (Math.abs(dl) > 0.01) {
          nGgDelta++; dTot += dl;
          delta.push({
            station: st, matricola: k, lavoratore: w.nome, contratto: w.contratto, data: d, giorno: GG[weekday(d)],
            oreTracking: trk, oreLavoro: round2(lavoro), oreAssenzeRetrib: round2(assret), oreAssenzeNonRetrib: round2(assnr),
            oreZucchetti: round2(zz), delta: round2(dl),
            vociTracking: Object.entries(voci).map(([kk, v]) => `${kk} ${fmt(v ?? 0)}`).join(", "),
            lettura: zz === 0 && trk > 0 ? "manca su Zucchetti" : trk === 0 && zz > 0 ? "manca su tracking" : "ore diverse",
          });
        }
      }
    }
    matrici[st] = mat;
    for (const [k, z] of Z) {
      if (usati.has(k)) continue;
      const tot = round2(Object.values(z.giorni).reduce((a, b) => a + b, 0));
      nonAbbinati.push({ station: st, fonte: "ZUCCHETTI", matricola: k, lavoratore: z.nome, cf: "", contratto: `%PT ${text(z.pt)}`, oreMese: tot, nota: "su Zucchetti ma non nel tracking SIC" + (tot === 0 ? " (0 ore: probabile cessato/non attivo)" : "") });
    }
    riepilogo.push({
      station: st, lavoratoriTracking: lav.length, lavoratoriZucchetti: Z.size, abbinati: nMatch,
      soloTracking: nonAbbinati.filter((x) => x.station === st && x.fonte === "TRACKING").length,
      soloZucchetti: nonAbbinati.filter((x) => x.station === st && x.fonte === "ZUCCHETTI").length,
      giorniConDelta: nGgDelta, deltaOreTot: round2(dTot),
      oreTrackingTot: Math.round(mat.reduce((s, x) => s + x.tracking, 0) * 10) / 10,
      oreZucchettiTot: Math.round(mat.reduce((s, x) => s + x.zucchetti, 0) * 10) / 10,
    });
  }

  const domStdL: { station: Station; l: Lavoratore }[] = [];
  for (const st of STATIONS) {
    const s = input.trackingStd?.[st];
    if (!s) continue;
    try { for (const w of leggiLavoratori(s, anno, mese).lavoratori) domStdL.push({ station: st, l: w }); } catch { /* STD facoltativi */ }
  }
  const domSic = domSicL.map(({ station, l }) => ({ station, lavoratore: l, check: controlloDomenica(l, anno, mese) }));
  const domStd = domStdL.map(({ station, l }) => ({ station, lavoratore: l, check: controlloDomenica(l, anno, mese) }));

  const tabellaSeiPiuDom: EsitoFineMese["tabellaSeiPiuDom"] = {};
  for (const st of STATIONS) {
    if (!input.trackingSic[st]) continue;
    const t: Record<number, string[]> = {};
    for (const dom of domenicheDelMese(anno, mese)) {
      t[dom] = domSic.filter((x) => x.station === st && dom >= 7 && x.check.seiPiuDom[dom] === 1).map((x) => x.lavoratore.nome).sort(cmp);
    }
    tabellaSeiPiuDom[st] = t;
  }
  const consecutivi: EsitoFineMese["consecutivi"] = [];
  for (const [tipo, rows] of [["SIC", domSic], ["STD", domStd]] as const) {
    for (const x of rows) {
      if (x.check.maxConsecutivi >= 7) {
        consecutivi.push({ station: x.station, tipo, lavoratore: x.lavoratore.nome, dal: giorniMese[x.check.consecDal - 1], al: giorniMese[x.check.consecAl - 1], giorni: x.check.maxConsecutivi });
      }
    }
  }
  return { anno, mese, riepilogo, delta, nonAbbinati, matrici, domSic, domStd, tabellaSeiPiuDom, consecutivi, mancanti };
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
