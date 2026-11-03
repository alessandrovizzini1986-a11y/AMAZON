import { describe, it, expect } from "vitest";
import { leggiLavoratori } from "@/domain/presenze/lavoratori";
import { festiviAnno, festiviMese } from "@/domain/costi/festivi";
import { aggregaAdit, leggiAdit, tariffeDaAdit } from "@/domain/costi/adit";
import { oreStation, stimaStd, totaleStime } from "@/domain/costi/std";
import { esempio, files, grids, hasKit } from "./kit";

const ST = ["DER1", "DER2", "DLO2", "DLO4", "DLO5", "DLZ2", "DVN1"];
const stationDi = (f: string) => ST.find((s) => f.toUpperCase().includes(s))!;
const TAR = [{ voce: "TRASFERTA", validaDal: "2026-01-01", valore: 22.5 }, { voce: "TRASFERTA_DOM_EXTRA", validaDal: "2025-05-01", valore: 7 }];

describe.skipIf(!hasKit)("STD settembre 2026 (golden)", () => {
  it("ore lavoro, teste, stima per station = 906.308, ADIT 0926 902.314", async () => {
    const fest = festiviAnno(2026);
    const ore = [];
    for (const f of files("tracking_std_set26")) {
      const st = stationDi(f);
      const { lavoratori } = leggiLavoratori(await grids(f), 2026, 9);
      ore.push(oreStation(st, lavoratori, fest, TAR));
    }
    ore.sort((a, b) => a.station.localeCompare(b.station));
    expect(ore.map((o) => Math.round((o.standard + o.straord + o.suppl + o.accordo) * 10) / 10)).toEqual([3409.2, 8884.6, 5473.3, 4060.9, 4558.0, 2971.9, 6612.5]);
    expect(ore.map((o) => o.teste)).toEqual([33, 90, 68, 49, 62, 36, 66]);

    const ago = leggiAdit(await grids(esempio("adit", "0826_Doc._emessi_ADIT_STD-SL_09.09.26.xlsx")));
    expect(ago.meseFattura).toBe("2026-08");
    const t = tariffeDaAdit(ago.righe);
    expect([t.STANDARD, t.STR30, t.SUPP18, t.MAGG50, t.STR65].map((x) => Math.round(x * 100) / 100)).toEqual([20.86, 20.11, 18.25, 28.56, 25.52]);
    const stime = ore.map((o) => stimaStd(o, t, { CTRB_H: 0.1, ALTRO_PCT: 0.002, GG_MESE: 26, MOG: 0 }, festiviMese(2026, 9, o.station, fest).length));
    expect(stime.map((s) => s.core)).toEqual([79696.0, 219169.84, 133140.22, 99821.87, 111142.69, 69462.47, 160939.06]);
    expect(stime.map((s) => s.totale)).toEqual([82043.59, 230192.21, 140528.9, 104714.36, 113367.55, 71322.26, 164139.21]);
    expect(totaleStime(stime)).toBe(906308.07);

    const set = leggiAdit(await grids(esempio("adit", "0926_Doc._emessi_ADIT_STD-SL_08.10.26.xlsx")));
    expect(set.meseFattura).toBe("2026-09");
    expect(Math.round(set.righe.reduce((a, r) => a + r.costo, 0) * 100) / 100).toBe(902314.11);
    const ag = aggregaAdit(set.righe);
    expect(ST.map((s) => ag[s].STANDARD!.teste)).toEqual([29, 89, 67, 46, 62, 33, 65]);
    expect(Math.round(set.righe.filter((r) => r.residuo).reduce((a, r) => a + r.costo, 0))).toBe(3196);
    // riconciliazione: ogni station entro ±1,2 %, totale +0,4 %; la scomposizione somma al delta
    const { riconciliaStd } = await import("@/domain/costi/riconciliazione");
    const salvate = stime.flatMap((s) => [...s.righe.map((r) => ({ station: s.station, voce: r.voce, quantita: r.quantita, importo: r.importo })), { station: s.station, voce: "TOTALE", quantita: null, importo: s.totale }]);
    const agg = new Map<string, { station: string; voce: string; residuo: boolean; quantita: number; costo: number }>();
    for (const r of set.righe) { const k = `${r.station}|${r.voce}|${r.residuo}`; const x = agg.get(k) ?? { station: r.station, voce: r.voce, residuo: r.residuo, quantita: 0, costo: 0 }; x.quantita += r.quantita; x.costo += r.costo; agg.set(k, x); }
    const ric = riconciliaStd(salvate, [...agg.values()]);
    for (const s of ric.sintesi) {
      expect(Math.abs(s.delta / s.consuntivo), s.station).toBeLessThan(0.0125); // "entro ±1,2 %" (DVN1 1,23 %)
      expect(s.tariffe + s.ore + s.trasferte + s.nonTracking + s.nonModellate + s.residui, s.station).toBeCloseTo(s.delta, 0);
    }
    const S = ric.sintesi.reduce((a, s) => a + s.stima, 0), C = ric.sintesi.reduce((a, s) => a + s.consuntivo, 0);
    expect(Math.round(((S - C) / C) * 1000) / 10).toBe(0.4);
  }, 120_000);
});

describe.skipIf(!hasKit)("controlli STD settembre (golden)", () => {
  it("totali file, rapporti ore vs ADIT 0926", async () => {
    const { letturaFile, rapportiAdit } = await import("@/domain/costi/controlli");
    const fest = festiviAnno(2026);
    const set = aggregaAdit(leggiAdit(await grids(esempio("adit", "0926_Doc._emessi_ADIT_STD-SL_08.10.26.xlsx"))).righe);
    const rap: Record<string, Record<string, number | null>> = {};
    for (const f of files("tracking_std_set26")) {
      const st = stationDi(f);
      const g = await grids(f);
      const { lavoratori } = leggiLavoratori(g, 2026, 9);
      const o = oreStation(st, lavoratori, fest, TAR);
      const l = letturaFile(g, 2026, 9);
      expect(Math.abs(l.totali - (o.standard + o.straord + o.suppl + o.accordo)), st).toBeLessThan(0.5);
      rap[st] = Object.fromEntries(rapportiAdit(o, set[st]).map((r) => [r.voce, r.rapporto === null ? null : Math.round(r.rapporto * 100) / 100]));
    }
    for (const st of ST) expect(rap[st].Standard, st).toBeCloseTo(1, 1);
    expect([rap.DER1.MAGG50, rap.DLZ2.MAGG50, rap.DER1.STR30]).toEqual([1.08, 0.92, 0.71]);
  }, 120_000);
});
