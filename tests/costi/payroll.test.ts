import { describe, it, expect } from "vitest";
import { leggiAnagraficaCDL } from "@/domain/costi/anagrafica";
import { COMPONENTI, componentiPerStation, leggiPayroll, nomeKey, stationPerDipendente } from "@/domain/costi/payroll";
import { esempio, grids, hasKit } from "./kit";

describe("nome normalizzato", () => {
  it("ordine e accenti indifferenti", () => { expect(nomeKey("Rossi  Mario")).toBe(nomeKey("MARIO ROSSI")); expect(nomeKey("Nicolò D'Amico")).toBe(nomeKey("DAMICO NICOLO")); });
});

describe.skipIf(!hasKit)("payroll 09/2026 (golden)", () => {
  it("CDC 5569 conti 6*: 1.209.421 €, 403 dipendenti, componenti", async () => {
    const p = leggiPayroll(await grids(esempio("payroll", "Costi_del_Personale_PS_0926_AMAZONGLS.xlsx")));
    const tot = p.righe.reduce((s, r) => s + r.importo, 0);
    expect(Math.round(tot)).toBe(1209421);
    expect(p.dipendenti).toBe(403);
    const comp: Record<string, number> = {};
    for (const r of p.righe) comp[r.componente] = (comp[r.componente] ?? 0) + r.importo;
    const g = (k: string) => Math.round(comp[k] ?? 0);
    expect({ BASE: g("BASE"), ASSENZE: g("ASSENZE"), TRASFERTA: g("TRASFERTA"), STR_SUPP_MAGG: g("STR_SUPP_MAGG"), FESTIVITA: g("FESTIVITA"), CARENZA_INTEGR: g("CARENZA_INTEGR"), ONERI: g("ONERI"), RATEI_13_14: g("RATEI_13_14"), RATEI_FERIE: g("RATEI_FERIE"), TFR: g("TFR"), INDENNITA_FISSE: g("INDENNITA_FISSE") })
      .toEqual({ BASE: 659320, ASSENZE: -67272, TRASFERTA: 109405, STR_SUPP_MAGG: 82267, FESTIVITA: 33728, CARENZA_INTEGR: 23625, ONERI: 265004, RATEI_13_14: 145106, RATEI_FERIE: -112508, TFR: 65099, INDENNITA_FISSE: 4400 });
    expect(Math.abs(comp.RECLASS ?? 0)).toBeLessThan(0.01);
    const a = leggiAnagraficaCDL(await grids(esempio("anagrafica", "DB_CDL_base_0626_AmazonGLS_BO.xlsx")));
    const st = stationPerDipendente(p.righe, a.righe);
    const per = componentiPerStation(p.righe.map((r) => ({ ...r, station: st.get(r.dipe) ?? null })));
    const ni = per["(non in anagrafica)"];
    expect([ni.dipendenti, Math.round(ni.TOTALE)]).toEqual([7, 13468]);
    // Station_SET dell'analisi: totali per station
    expect(Object.fromEntries(Object.entries(per).map(([s, x]) => [s, Math.round(x.TOTALE * 100) / 100]))).toMatchObject({ DER1: 144117.72, DER2: 138801.14, DLO2: 259918.44, DLO4: 146003.38, DLO5: 147758.93, DLZ2: 184145.97, DVN1: 175207.37 });
    expect(COMPONENTI.length).toBeGreaterThan(10);
  }, 180_000);
});

describe("riconciliazione e coefficienti", async () => {
  const { colore, riconciliaStd, coefficientiMese, mediaMobile } = await import("@/domain/costi/riconciliazione");
  it("colori ±5/±15 %", () => { expect([colore(104, 100), colore(110, 100), colore(120, 100), colore(0, 0)]).toEqual(["verde", "giallo", "rosso", "neutro"]); });
  it("STD: SUPP65 confluisce in STR65, residui a parte, scomposizione che somma al delta", () => {
    const stima = [
      { station: "DER1", voce: "STANDARD", quantita: 100, importo: 2100 }, { station: "DER1", voce: "STR65", quantita: 10, importo: 255 }, { station: "DER1", voce: "SUPP65", quantita: 2, importo: 51 },
      { station: "DER1", voce: "TRASFERTA", quantita: 10, importo: 225 }, { station: "DER1", voce: "FESTIVITA", quantita: 5, importo: 95 }, { station: "DER1", voce: "TOTALE", quantita: null, importo: 2726 },
    ];
    const adit = [
      { station: "DER1", voce: "STANDARD", quantita: 98, costo: 2058, residuo: false }, { station: "DER1", voce: "STR65", quantita: 12, costo: 306, residuo: false },
      { station: "DER1", voce: "TRASFERTA", quantita: 10, costo: 225, residuo: false }, { station: "DER1", voce: "RIVAL_RATEI", quantita: 0, costo: 40, residuo: false }, { station: "DER1", voce: "STANDARD", quantita: 2, costo: 42, residuo: true },
    ];
    const r = riconciliaStd(stima, adit);
    expect(r.righe.find((x) => x.voce === "STR65")).toMatchObject({ oreStima: 12, oreCons: 12, stima: 306, consuntivo: 306 });
    const s = r.sintesi[0];
    expect(s.delta).toBe(2726 - 2671);
    expect(r2(s.tariffe + s.ore + s.trasferte + s.nonTracking + s.nonModellate + s.residui)).toBe(s.delta);
  });
  it("coefficienti e media mobile su 3 mesi", () => {
    const c = coefficientiMese({ strFt: 1790, strPt: 161, supp: 1410, magg: 460, malattia: -950, carenza: 23.75, oneri: 360, tfr: 74, imponibile: 1000 }, { strFt: 100, strPt: 10, supp: 100, domFest: 100, malattia: 100 });
    expect(c).toEqual({ SIC_MOLT_ONERI: 1.434, SIC_STR_FT: 17.9, SIC_STR_PT: 16.1, SIC_SUPP: 14.1, SIC_DOMFEST: 4.6, SIC_MALATTIA_H: -9.5 });
    expect(mediaMobile([{ A: 1 }, { A: 2, B: 5 }, { A: 3 }, { A: 4 }])).toEqual({ A: 3, B: 5 });
  });
});
const r2 = (x: number) => Math.round(x * 100) / 100;
