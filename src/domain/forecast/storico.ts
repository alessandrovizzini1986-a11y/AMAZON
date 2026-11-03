/**
 * Storico delle versioni del forecast: stato del forecast a ogni versione,
 * rotte e furgoni per station e settimana, SWA simulate, precisione per anticipo.
 * Regole (docs/forecast-storico/PROMPT_forecast_storico_tendenza.md §5-bis).
 */
import { addGiorni, inizioSettimana, numeroSettimana } from "./settimane";
import { prevedi, type RigaForecast } from "./previsione";
import type { Calibrazione } from "./tariffe";

export type FileVersione = { id: string; linea: string; versione: string; caricatoIl: string };
export type RigaStorico = { fileId: string; data: string; station: string; cycle: string; classe: string; routes: number };

/**
 * Versione di un file = domenica della settimana di emissione: dal nome (PROF_<wk>_…),
 * risalendo dalla settimana della prima data del file; senza numero nel nome, la settimana della prima data.
 */
export function versioneFile(nome: string, primaData: string): string {
  const s0 = inizioSettimana(primaData);
  const m = /PROF_(\d{1,2})(?!\d)/i.exec(nome);
  if (!m) return s0;
  const wk = Number(m[1]);
  for (let i = 0; i <= 12; i++) { const s = addGiorni(s0, -7 * i); if (numeroSettimana(s) === wk) return s; }
  return s0;
}

/**
 * Righe del forecast valido alla versione v: per (station, data, linea ND/SD) vince il file con
 * versione più alta (≤ v), poi il caricato più tardi, e se ne tengono tutte le righe: una classe
 * che la versione nuova non riporta più non sopravvive dal file vecchio.
 */
export function statoAlla(files: FileVersione[], righe: RigaStorico[], v: string): RigaStorico[] {
  const fv = new Map(files.filter((f) => f.versione <= v).map((f) => [f.id, { o: `${f.versione}|${f.caricatoIl}|${f.id}`, linea: f.linea }]));
  const best = new Map<string, string>();
  const key = (r: RigaStorico, linea: string) => `${r.station}|${r.data}|${linea}`;
  for (const r of righe) {
    const f = fv.get(r.fileId);
    if (!f) continue;
    const k = key(r, f.linea);
    if (!best.has(k) || f.o > best.get(k)!) best.set(k, f.o);
  }
  return righe.filter((r) => { const f = fv.get(r.fileId); return f && best.get(key(r, f.linea)) === f.o; });
}

/** File ND in uso alla versione v (versione più alta, poi caricato più tardi). */
export function ultimoNd(files: FileVersione[], v: string): FileVersione | null {
  return files.filter((f) => f.linea === "ND" && f.versione <= v).sort((a, b) => `${b.versione}|${b.caricatoIl}`.localeCompare(`${a.versione}|${a.caricatoIl}`))[0] ?? null;
}

export type Giorno = { station: string; data: string; nd: number; ndFurgone: number; swa: number; swaSimulate: number; sdA: number; sdB: number; sdC: number };

const cicloSd = (cycle: string): "A" | "B" | "C" | null => { const m = /SD_([ABC])/i.exec(cycle); return m ? (m[1].toUpperCase() as "A" | "B" | "C") : null; };

/** Aggregato per station e giorno; il same day si legge dal ciclo (CYCLE_SD_A/B/C), non dalla classe. */
export function giorni(righe: RigaStorico[]): Giorno[] {
  const m = new Map<string, Giorno>();
  for (const r of righe) {
    if (r.classe === "NON_MAPPATO") continue;
    const k = `${r.station}|${r.data}`;
    const g = m.get(k) ?? { station: r.station, data: r.data, nd: 0, ndFurgone: 0, swa: 0, swaSimulate: 0, sdA: 0, sdB: 0, sdC: 0 };
    if (r.classe.startsWith("SD_")) {
      const c = cicloSd(r.cycle) ?? (r.classe.slice(3, 4) as "A" | "B" | "C");
      if (c === "A") g.sdA += r.routes; else if (c === "B") g.sdB += r.routes; else g.sdC += r.routes;
    } else {
      g.nd += r.routes;
      if (r.classe !== "ND_CARGOBIKE") g.ndFurgone += r.routes;
      if (r.classe === "ND_SWA") g.swa += r.routes;
    }
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => a.station.localeCompare(b.station) || a.data.localeCompare(b.data));
}

/**
 * SWA / MFN pickup oltre l'orizzonte del next: per ogni station, media per giorno della settimana
 * delle SWA del file ND in uso (`fonte`: le sue righe), applicata dal giorno dopo la sua ultima data
 * con SWA fino a `fino`, sui giorni senza SWA. Restituisce anche le righe simulate (per i €).
 */
export function simulaSwa(gs: Giorno[], fino: string, fonte: RigaStorico[]): { giorni: Giorno[]; righe: RigaStorico[] } {
  const out = gs.map((g) => ({ ...g }));
  const righe: RigaStorico[] = [];
  const dow = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();
  for (const st of [...new Set(fonte.filter((r) => r.classe === "ND_SWA").map((r) => r.station))]) {
    const nd = fonte.filter((r) => r.station === st);
    const swa = nd.filter((r) => r.classe === "ND_SWA");
    const ultimaSwa = swa.reduce((m, r) => (r.data > m ? r.data : m), swa[0].data);
    // media per giorno della settimana sui giorni coperti dal file (con o senza SWA quel giorno)
    const giorniFile = [...new Set(nd.map((r) => r.data))].filter((d) => d <= ultimaSwa);
    const somma = Array(7).fill(0), n = Array(7).fill(0);
    for (const d of giorniFile) { n[dow(d)]++; somma[dow(d)] += swa.filter((r) => r.data === d).reduce((t, r) => t + r.routes, 0); }
    const media = somma.map((x, i) => (n[i] ? Math.round(x / n[i]) : 0));
    for (let d = addGiorni(ultimaSwa, 1); d <= fino; d = addGiorni(d, 1)) {
      const q = media[dow(d)];
      if (!q) continue;
      let g = out.find((x) => x.station === st && x.data === d);
      if (g?.swa) continue;
      if (!g) { g = { station: st, data: d, nd: 0, ndFurgone: 0, swa: 0, swaSimulate: 0, sdA: 0, sdB: 0, sdC: 0 }; out.push(g); }
      g.swaSimulate += q; g.nd += q; g.ndFurgone += q;
      righe.push({ fileId: "SIMULATE", data: d, station: st, cycle: "SWA_PM", classe: "ND_SWA", routes: q });
    }
  }
  out.sort((a, b) => a.station.localeCompare(b.station) || a.data.localeCompare(b.data));
  return { giorni: out, righe };
}

/** Rotte del giorno: next (tutte) + same A + max(same B, same C). */
export const rotteGiorno = (g: Giorno) => g.nd + g.sdA + Math.max(g.sdB, g.sdC);
export const rotteNdGiorno = (g: Giorno) => g.nd;
export const rotteSdGiorno = (g: Giorno) => g.sdA + Math.max(g.sdB, g.sdC);

export type Settimana = {
  station: string; settimana: string; week: number; rotte: number; rotteND: number; rotteSD: number;
  /** picco next con furgone (senza cargo bike) + picco max(A, B, C) */
  furgoni: number; piccoND: number; piccoSD: number; piccoStessoGiorno: number;
  swaSimulate: number; parziale: boolean;
};

/** Rotte e furgoni per station e settimana. Parziale = settimana senza next nel forecast (solo same day e/o SWA simulate). */
export function settimane(gs: Giorno[]): Settimana[] {
  const m = new Map<string, Giorno[]>();
  for (const g of gs) { const k = `${g.station}|${inizioSettimana(g.data)}`; if (!m.has(k)) m.set(k, []); m.get(k)!.push(g); }
  return [...m.entries()].map(([k, xs]) => {
    const [station, settimana] = k.split("|");
    const piccoND = Math.max(0, ...xs.map((g) => g.ndFurgone)), piccoSD = Math.max(0, ...xs.map((g) => Math.max(g.sdA, g.sdB, g.sdC)));
    const sum = (f: (g: Giorno) => number) => xs.reduce((s, g) => s + f(g), 0);
    return {
      station, settimana, week: numeroSettimana(settimana), rotte: sum(rotteGiorno), rotteND: sum(rotteNdGiorno), rotteSD: sum(rotteSdGiorno),
      furgoni: piccoND + piccoSD, piccoND, piccoSD, piccoStessoGiorno: Math.max(0, ...xs.map((g) => g.ndFurgone + Math.max(g.sdA, g.sdB, g.sdC))),
      swaSimulate: sum((g) => g.swaSimulate), parziale: sum((g) => g.nd - g.swaSimulate) === 0,
    };
  }).sort((a, b) => a.settimana.localeCompare(b.settimana) || a.station.localeCompare(b.station));
}

export type PuntoVersione = Settimana & { versione: string; versioneWeek: number; anticipo: number; eur: number; eurND: number; eurSD: number };

/**
 * Per ogni versione: stato del forecast, SWA simulate, rotte/furgoni e € per station × settimana
 * target (solo target ≥ versione: anticipo = settimane tra versione e target).
 * `calPer(settimana)` dà la calibrazione da usare per quella settimana target.
 */
export function storico(files: FileVersione[], righe: RigaStorico[], calPer: (settimana: string) => Calibrazione): PuntoVersione[] {
  const versioni = [...new Set(files.map((f) => f.versione))].sort();
  const out: PuntoVersione[] = [];
  for (const v of versioni) {
    const stato = statoAlla(files, righe, v);
    if (!stato.length) continue;
    const fino = stato.reduce((m, r) => (r.data > m ? r.data : m), stato[0].data);
    const nd = ultimoNd(files, v);
    const sim = simulaSwa(giorni(stato), fino, nd ? righe.filter((r) => r.fileId === nd.id) : []);
    const tutte = [...stato, ...sim.righe].filter((r) => inizioSettimana(r.data) >= v);
    const sett = settimane(sim.giorni.filter((g) => inizioSettimana(g.data) >= v));
    const perW = new Map<string, RigaForecast[]>();
    for (const r of tutte) { const w = inizioSettimana(r.data); if (!perW.has(w)) perW.set(w, []); perW.get(w)!.push({ data: r.data, station: r.station, classe: r.classe, routes: r.routes }); }
    const eur = new Map<string, { t: number; nd: number; sd: number }>();
    for (const [w, rs] of perW) for (const p of prevedi(rs, calPer(w))) {
      const extraNd = p.rotteND + p.rotteSD ? (p.previstoExtra * p.rotteND) / (p.rotteND + p.rotteSD) : 0;
      eur.set(`${p.ds}|${w}`, { t: p.totale, nd: p.previstoND + extraNd, sd: p.totale - p.previstoND - extraNd });
    }
    for (const s of sett) {
      const e = eur.get(`${s.station}|${s.settimana}`) ?? { t: 0, nd: 0, sd: 0 };
      out.push({ ...s, versione: v, versioneWeek: numeroSettimana(v), anticipo: Math.round((Date.parse(s.settimana) - Date.parse(v)) / (7 * 864e5)), eur: e.t, eurND: e.nd, eurSD: e.sd });
    }
  }
  return out;
}

/** Ultimo punto per (station, settimana): la versione più alta. */
export function ultimaVersione(p: PuntoVersione[]): PuntoVersione[] {
  const m = new Map<string, PuntoVersione>();
  for (const x of p) { const k = `${x.station}|${x.settimana}`; const y = m.get(k); if (!y || x.versione > y.versione) m.set(k, x); }
  return [...m.values()];
}

export type Precisione = { station: string; anticipo: 0 | 1 | 2 | 3; errore: number; settimane: number };

/**
 * Errore medio |previsto − reale| / reale per station e anticipo (0, 1, 2, 3+) sulle settimane
 * chiuse; per ogni (settimana, anticipo) la versione con quell'anticipo (3+ = la più lontana ≥ 3).
 * `reale(station, settimana)` → € fatturati o null. "TUTTE" = sui totali delle DS.
 */
export function precisione(p: PuntoVersione[], reale: (station: string, settimana: string) => number | null, chiusa: (settimana: string) => boolean): Precisione[] {
  const sel = new Map<string, PuntoVersione>();
  for (const x of p.filter((y) => chiusa(y.settimana) && !y.parziale)) {
    const a = Math.min(3, x.anticipo) as 0 | 1 | 2 | 3;
    const k = `${x.station}|${x.settimana}|${a}`;
    const y = sel.get(k);
    if (!y || (a === 3 ? x.anticipo > y.anticipo : x.versione > y.versione)) sel.set(k, x);
  }
  const acc = new Map<string, { s: number; n: number }>();
  const add = (k: string, e: number) => { const z = acc.get(k) ?? { s: 0, n: 0 }; z.s += e; z.n++; acc.set(k, z); };
  const tot = new Map<string, { prev: number; real: number; n: number }>();
  for (const [k, x] of sel) {
    const r = reale(x.station, x.settimana);
    if (!r) continue;
    const a = k.split("|")[2];
    add(`${x.station}|${a}`, Math.abs(x.eur - r) / r);
    const t = tot.get(`${x.settimana}|${a}`) ?? { prev: 0, real: 0, n: 0 }; t.prev += x.eur; t.real += r; t.n++; tot.set(`${x.settimana}|${a}`, t);
  }
  for (const [k, t] of tot) add(`TUTTE|${k.split("|")[1]}`, Math.abs(t.prev - t.real) / t.real);
  return [...acc.entries()].map(([k, z]) => { const [station, a] = k.split("|"); return { station, anticipo: Number(a) as 0 | 1 | 2 | 3, errore: Math.round((z.s / z.n) * 1000) / 10, settimane: z.n }; })
    .sort((a, b) => a.station.localeCompare(b.station) || a.anticipo - b.anticipo);
}
