import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { leggiLavoratori } from "@/domain/presenze/lavoratori";
import { festiviAnno, festiviMese } from "@/domain/costi/festivi";
import { leggiAnagraficaCDL } from "@/domain/costi/anagrafica";
import { leggiAdit, tariffeDaAdit } from "@/domain/costi/adit";
import { bustaStation, lavoratoriSic, sicLordo } from "@/domain/costi/sic";
import { esempio, files, grids, hasKit } from "./kit";

const ST = ["DER1", "DER2", "DLO2", "DLO4", "DLO5", "DLZ2", "DVN1"];
const stationDi = (f: string) => ST.find((s) => f.toUpperCase().includes(s))!;
const TAR = [{ voce: "TRASFERTA", validaDal: "2026-01-01", valore: 22.5 }, { voce: "TRASFERTA_DOM_EXTRA", validaDal: "2025-05-01", valore: 7 }];
const PSIC = { MOLT_ONERI: 1.434, STR_FT: 17.9, STR_PT: 16.1, SUPP: 14.1, DOMFEST: 4.6, MALATTIA_H: -9.5, CARENZA_PCT: 0.025 };

describe.skipIf(!hasKit)("SIC settembre 2026 (golden)", () => {
  it("ore, teste, join CDL, lordo, saving, festività", async () => {
    const fest = festiviAnno(2026);
    const a = leggiAnagraficaCDL(await grids(esempio("anagrafica", "DB_CDL_base_0626_AmazonGLS_BO.xlsx")));
    const idx = new Map(a.righe.map((r) => [r.cf, r]));
    const t = tariffeDaAdit(leggiAdit(await grids(esempio("adit", "0826_Doc._emessi_ADIT_STD-SL_09.09.26.xlsx"))).righe);
    const per: Record<string, ReturnType<typeof lavoratoriSic>> = {};
    for (const f of files("tracking_sic_set26")) {
      const st = stationDi(f);
      const { lavoratori } = leggiLavoratori(await grids(f), 2026, 9);
      per[st] = lavoratoriSic(st, lavoratori, idx, fest, TAR, festiviMese(2026, 9, st, fest).map((x) => x.data));
    }
    const ore = ST.map((s) => Math.round(per[s].reduce((x, l) => x + l.standard + l.straord + l.suppl + l.accordo, 0) * 10) / 10);
    expect(ore).toEqual([6278, 4424, 10092.4, 6570.3, 5937.5, 7529, 6157]);
    expect(ST.map((s) => per[s].length)).toEqual([51, 43, 89, 52, 49, 59, 51]);
    const tutti = ST.flatMap((s) => per[s]);
    expect([tutti.filter((x) => x.inAnagrafica).length, tutti.filter((x) => x.cfCorretto).length, tutti.filter((x) => !x.inAnagrafica).length]).toEqual([387, 1, 7]);
    const tracciati = new Set(tutti.filter((x) => x.anag).map((x) => x.anag!.cf));
    const nonTr = a.righe.filter((r) => !tracciati.has(r.cf));
    // l'atteso del kit (17, 45.542) conta anche il lavoratore col CF corretto O/0, che invece è tracciato:
    // 403 − 387 = 16, e 1.256.309,94 − 42.023 = 1.214.287 = Σ CDL tracciati dello stesso kit
    expect([nonTr.length, Math.round(nonTr.reduce((s, r) => s + r.cdl, 0))]).toEqual([16, 42023]);
    expect(Math.round(tutti.filter((x) => x.inAnagrafica).reduce((s, x) => s + x.cdl, 0))).toBe(1214287);
    const lordo = ST.map((s) => sicLordo(s, per[s], t, { dispatcherTrasferta: true }));
    expect(lordo.map((x) => x.lordo)).toEqual([194398.05, 157104.52, 345777.19, 202045.4, 189224.56, 234449.84, 198067.06]);
    expect(lordo.reduce((s, x) => s + x.savingRatei, 0)).toBeCloseTo(119452.13, 1);
    expect(lordo.reduce((s, x) => s + x.festNonGodute, 0)).toBeCloseTo(18565.76, 1);
  }, 180_000);

  it("busta 27/09 da tracking agosto: DVN1 / DLO5 e trasferte", async () => {
    const fest = festiviAnno(2026);
    const a = leggiAnagraficaCDL(await grids(esempio("anagrafica", "DB_CDL_base_0626_AmazonGLS_BO.xlsx")));
    const idx = new Map(a.righe.map((r) => [r.cf, r]));
    const out: Record<string, number> = {}, trasf: Record<string, number> = {};
    for (const f of files("tracking_sic_set26").filter((f) => /DVN1|DLO5/.test(f))) {
      const st = stationDi(f);
      const { lavoratori } = leggiLavoratori(await grids(f), 2026, 8);
      const l = lavoratoriSic(st, lavoratori, idx, fest, TAR, festiviMese(2026, 8, st, fest).map((x) => x.data));
      const b = bustaStation(st, l, PSIC);
      out[st] = b.totale; trasf[st] = b.trasferte;
    }
    // trasferta pagata a settembre, dispatcher e cessati ad agosto esclusi: uguale al payroll 09 (anagrafica 0926)
    expect(trasf).toEqual({ DLO5: 13631, DVN1: 16836 });
    // busta vs paga reale (Station_SET TOTALE): DVN1 175.207,37, DLO5 147.758,93
    expect(Math.abs(out.DVN1 / 175207.37 - 1)).toBeLessThan(0.03);
    expect(Math.abs(out.DLO5 / 147758.93 - 1)).toBeLessThan(0.09);
  }, 180_000);

  const ago = esempio("tracking_sic_ago26");
  it.skipIf(!fs.existsSync(ago))("busta 27/09 da tutti i tracking di agosto vs payroll 09/2026: −1,0 % sul totale (CDL SIC Valerio 1.214.338,51)", async () => {
    const fest = festiviAnno(2026);
    const a = leggiAnagraficaCDL(await grids(esempio("fo", "DB_CDL_base_0926_AmazonGLS_BO.xlsx")));
    const idx = new Map(a.righe.map((r) => [r.cf, r]));
    const tot: Record<string, number> = {}, trasf: Record<string, number> = {};
    for (const f of files("tracking_sic_ago26")) {
      const st = stationDi(f);
      const { lavoratori } = leggiLavoratori(await grids(f), 2026, 8);
      const b = bustaStation(st, lavoratoriSic(st, lavoratori, idx, fest, TAR, festiviMese(2026, 8, st, fest).map((x) => x.data)), PSIC);
      tot[st] = Math.round(b.totale); trasf[st] = Math.round(b.trasferte);
    }
    // DLO2/DLO4 partono dal 27/07: agosto intero, trasferte = paga di settembre
    expect([trasf.DLO4, trasf.DLO5, trasf.DER1, trasf.DVN1]).toEqual([11854, 13631, 11706, 16836]);
    const somma = Object.values(tot).reduce((s, x) => s + x, 0);
    expect(Math.abs(somma / 1209420.66 - 1)).toBeLessThan(0.02);
    for (const st of ST) expect(Math.abs(tot[st] / { DER1: 144118, DER2: 138964, DLO2: 265219, DLO4: 147438, DLO5: 149754, DLZ2: 188225, DVN1: 174989 }[st]! - 1)).toBeLessThan(0.07);
  }, 300_000);
});
