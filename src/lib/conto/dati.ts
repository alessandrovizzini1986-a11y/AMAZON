import "server-only";
import { db } from "@/lib/db";
import { DS_FATTURATO, dsAmazon } from "@/domain/fatture/fatturato";
import { costoParcheggio } from "@/domain/fatture/rimborsi";
import { mesiTra, meseSpostato } from "@/lib/mesi";
import { canoniMese, fatturaOpenBook, lavoroGls, rigaConto, sommaRighe, VOCI_GLS, type CostiGlsMese, type Fonte, type PeriodoMezzo, type RigaConto, type VoceCosto } from "@/domain/conto/economico";

export const STATION_CONTO = [...DS_FATTURATO, "GLS"];
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const chiaveMese = (anno: number, mese: number) => `${anno}-${String(mese).padStart(2, "0")}`;
const stationRun = (k: string) => (k.trim().toUpperCase().startsWith("GLS") ? "GLS" : dsAmazon(k.trim().toUpperCase()));
const sommaRun = (j: unknown) => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries((j ?? {}) as Record<string, unknown>)) {
    const tot = typeof v === "number" ? v : Object.values((v ?? {}) as Record<string, unknown>).reduce<number>((a, b) => a + (typeof b === "number" ? b : 0), 0);
    const s = stationRun(k);
    out[s] = (out[s] ?? 0) + Math.abs(tot);
  }
  return out;
};
/** L'ultima versione per chiave (ordinate per data crescente). */
const ultimaPer = <T,>(xs: T[], k: (x: T) => string) => { const m = new Map<string, T>(); for (const x of xs) m.set(k(x), x); return m; };

export type ContoMese = { mese: string; perStation: RigaConto[]; amazon: RigaConto; gls: RigaConto };

/** Conto economico dei mesi da `da` ad `a` (AAAA-MM). Carica anche i due mesi prima per l'open book GLS. */
export async function contoEconomico(da: string, a: string): Promise<ContoMese[]> {
  const mesi = mesiTra(da, a);
  const primo = meseSpostato(da, -2);
  const anni = [...new Set(mesiTra(primo, a).map((m) => Number(m.slice(0, 4))))];
  const [righeFatt, stime, ric, q8, tp, cons, par, veicoli] = await Promise.all([
    db.amazonInvoiceLine.groupBy({ by: ["anno", "mese", "ds"], where: { anno: { in: anni } }, _sum: { avere: true } }),
    db.stimaCosti.findMany({ where: { mese: { gte: primo, lte: a }, OR: [{ voce: "TOTALE", popolazione: { in: ["STD", "SIC"] } }, { popolazione: "GLS" }] }, orderBy: { creataIl: "asc" }, select: { mese: true, popolazione: true, station: true, voce: true, importo: true, quantita: true, creataIl: true, versioneAnagrafica: true } }),
    db.riconciliazione.findMany({ where: { mese: { gte: primo, lte: a }, voce: "TOTALE" }, orderBy: { creataIl: "asc" }, select: { mese: true, popolazione: true, station: true, consuntivo: true, creataIl: true } }),
    db.q8Run.findMany({ where: { anno: { in: anni } }, orderBy: { eseguitoIl: "asc" }, select: { anno: true, mese: true, totaliJson: true } }),
    db.telepassRun.findMany({ where: { anno: { in: anni } }, orderBy: { eseguitoIl: "asc" }, select: { anno: true, mese: true, totaliJson: true } }),
    db.costoConsuntivo.findMany({ where: { anno: { in: anni } } }),
    db.parametro.findMany({ where: { chiave: { startsWith: "PARCHEGGIO_" } } }),
    db.vehicle.findMany({ where: { canoneMese: { gt: 0 } }, select: { stato: true, canoneMese: true, contrattoDataInizio: true, contrattoDataFine: true, station: { select: { code: true } }, stationHistory: { select: { fromDate: true, toDate: true, station: { select: { code: true } } } } } }),
  ]);

  const ricavi = new Map<string, number>();
  for (const r of righeFatt) { const k = `${chiaveMese(r.anno, r.mese)}|${dsAmazon(r.ds)}`; ricavi.set(k, (ricavi.get(k) ?? 0) + Number(r._sum.avere ?? 0)); }

  // personale Amazon: consuntivo riconciliato se c'è (ultima versione per mese e popolazione), altrimenti la stima salvata più recente
  const versStima = ultimaPer(stime.filter((s) => s.popolazione !== "GLS"), (s) => `${s.mese}|${s.popolazione}`);
  const versRic = ultimaPer(ric, (r) => `${r.mese}|${r.popolazione}`);
  const personale = (m: string, st: string): Fonte => {
    let tot = 0, ok = false; const fonti: string[] = [];
    for (const pop of ["STD", "SIC"]) {
      const r = versRic.get(`${m}|${pop}`);
      if (r) { const x = ric.filter((y) => y.mese === m && y.popolazione === pop && y.creataIl.getTime() === r.creataIl.getTime() && y.station === st); if (x.length) { tot += x.reduce((a, y) => a + Number(y.consuntivo), 0); ok = true; fonti.push(`${pop} consuntivo`); continue; } }
      const s = versStima.get(`${m}|${pop}`);
      if (s) { const x = stime.filter((y) => y.mese === m && y.popolazione === pop && y.creataIl.getTime() === s.creataIl.getTime() && y.station === st); if (x.length) { tot += x.reduce((a, y) => a + Number(y.importo), 0); ok = true; fonti.push(`${pop} stima`); } }
    }
    return { valore: ok ? Math.round(tot * 100) / 100 : null, fonte: fonti.join(" + ") };
  };

  // GLS: ultima versione salvata dalla pagina Costi GLS
  const versGls = ultimaPer(stime.filter((s) => s.popolazione === "GLS"), (s) => s.mese);
  const gls = (m: string): (CostiGlsMese & { nota: string }) | null => {
    const v = versGls.get(m);
    if (!v) return null;
    const x = stime.filter((y) => y.popolazione === "GLS" && y.mese === m && y.creataIl.getTime() === v.creataIl.getTime());
    const val = (voce: string, q = false) => { const r = x.find((y) => y.voce === voce); return r ? Number(q ? r.quantita ?? 0 : r.importo) : 0; };
    return { bustaSic: val(VOCI_GLS.bustaSic), accStraord: val(VOCI_GLS.accStraord), accFerie: val(VOCI_GLS.accFerie), std: val(VOCI_GLS.std), teste: val(VOCI_GLS.teste, true), danni: val(VOCI_GLS.danni), altri: val(VOCI_GLS.altri), nota: v.versioneAnagrafica ?? "" };
  };

  const ultimoRun = (runs: { anno: number; mese: number; totaliJson: unknown }[]) => { const m = new Map<string, Record<string, number>>(); for (const r of runs) m.set(chiaveMese(r.anno, r.mese), sommaRun(r.totaliJson)); return m; };
  const runQ8 = ultimoRun(q8), runTp = ultimoRun(tp);
  const consMap = new Map<string, number>();
  for (const c of cons) { const k = `${chiaveMese(c.anno, c.mese)}|${c.voce}|${c.ds}`; consMap.set(k, (consMap.get(k) ?? 0) + Number(c.importo)); }
  const haCons = (m: string, voce: string) => cons.some((c) => chiaveMese(c.anno, c.mese) === m && c.voce === voce);
  const daRun = (runs: Map<string, Record<string, number>>, voce: string, nome: string) => (m: string, st: string): Fonte => {
    if (st !== "GLS" && haCons(m, voce)) return { valore: Math.round((consMap.get(`${m}|${voce}|${st}`) ?? 0) * 100) / 100, fonte: "consuntivo contabile" };
    const r = runs.get(m);
    return r ? { valore: Math.round((r[st] ?? 0) * 100) / 100, fonte: nome } : { valore: null, fonte: `${nome} non elaborato` };
  };
  const carburante = daRun(runQ8, "CARBURANTE", "Q8"), pedaggi = daRun(runTp, "PEDAGGI", "Telepass");
  const parametri = par.map((p) => ({ chiave: p.chiave, validaDal: p.validaDal.toISOString().slice(0, 10), valore: Number(p.valore) }));

  // mezzi: periodi nelle station dallo storico (se manca, la station attuale per la durata del contratto)
  const periodi: PeriodoMezzo[] = veicoli.flatMap((v) => {
    const base = { canone: Number(v.canoneMese), sostitutivo: v.stato === "SOSTITUTIVO" };
    const fineDismesso = v.stato === "DISMESSO" ? iso(v.contrattoDataFine) ?? "1900-01-01" : null;
    if (v.stationHistory.length) return v.stationHistory.map((h) => ({ ...base, station: h.station.code, da: iso(h.fromDate)!, a: iso(h.toDate) ?? fineDismesso }));
    return [{ ...base, station: v.station.code, da: iso(v.contrattoDataInizio) ?? "2000-01-01", a: fineDismesso ?? iso(v.contrattoDataFine) }];
  });
  const canoniCache = new Map<string, Record<string, number>>();
  const canoni = (m: string) => { if (!canoniCache.has(m)) canoniCache.set(m, canoniMese(m, periodi)); return canoniCache.get(m)!; };

  const lavoroGlsMese = (m: string) => { const g = gls(m); return g ? lavoroGls(g, gls(meseSpostato(m, -1))) : null; };
  const mezziGls = (m: string) => (canoni(m).GLS ?? 0) + (gls(m)?.danni ?? 0);

  return mesi.map((m) => {
    const perStation = STATION_CONTO.map((st) => {
      if (st === "GLS") {
        const g = gls(m);
        const ob = fatturaOpenBook({ lavoroPrec: lavoroGlsMese(meseSpostato(m, -1)), mezziPrec: mezziGls(meseSpostato(m, -1)), carburantePrec: carburante(meseSpostato(m, -1), "GLS").valore ?? 0, pedaggiPrec2: pedaggi(meseSpostato(m, -2), "GLS").valore ?? 0, teste: g?.teste ?? 0 });
        const costi: Record<VoceCosto, Fonte> = {
          personale: { valore: lavoroGlsMese(m), fonte: g ? `costi GLS salvati (${g.nota || "stima"})` : "costi GLS del mese non salvati" },
          mezzi: { valore: Math.round(mezziGls(m) * 100) / 100, fonte: "canoni + danni" },
          carburante: carburante(m, "GLS"), pedaggi: pedaggi(m, "GLS"),
          parcheggi: { valore: 0, fonte: "" },
          altri: { valore: g ? g.altri : null, fonte: "elettrico, Wind, Elmec" },
        };
        return rigaConto("GLS", { valore: ob, fonte: ob === null ? "open book: mancano i costi GLS del mese prima" : "fattura open book stimata" }, costi);
      }
      const rv = ricavi.get(`${m}|${st}`);
      const parch = haCons(m, "PARCHEGGI") ? { valore: Math.round((consMap.get(`${m}|PARCHEGGI|${st}`) ?? 0) * 100) / 100, fonte: "consuntivo contabile" } : { valore: costoParcheggio(parametri, st, m), fonte: "Parametri" };
      return rigaConto(st, { valore: rv === undefined ? null : Math.round(rv * 100) / 100, fonte: "fatture Amazon" }, {
        personale: personale(m, st), mezzi: { valore: canoni(m)[st] ?? 0, fonte: "canoni" }, carburante: carburante(m, st), pedaggi: pedaggi(m, st), parcheggi: parch, altri: { valore: null, fonte: "" },
      });
    });
    const amazon = sommaRighe("Amazon", perStation.filter((r) => r.chiave !== "GLS"));
    return { mese: m, perStation, amazon, gls: perStation.find((r) => r.chiave === "GLS")! };
  });
}
