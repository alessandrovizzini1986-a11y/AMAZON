import { describe, expect, it } from "vitest";
import { canoniMese, fatturaOpenBook, giorniNelMese, lavoroGls, rigaConto, sommaRighe } from "@/domain/conto/economico";

const f = (valore: number | null, fonte = "x") => ({ valore, fonte });
const costi = (p: number) => ({ personale: f(p), mezzi: f(10), carburante: f(5), pedaggi: f(null), parcheggi: f(0), altri: f(null) });

describe("conto economico", () => {
  it("margine e percentuale; senza ricavi il margine è null", () => {
    const r = rigaConto("DER1", f(100), costi(50));
    expect(r.totaleCosti).toBe(65); expect(r.margine).toBe(35); expect(r.marginePct).toBe(35);
    expect(rigaConto("GLS", f(null), costi(1)).margine).toBeNull();
  });
  it("somma delle DS", () => {
    const s = sommaRighe("Amazon", [rigaConto("A", f(100), costi(50)), rigaConto("B", f(200), costi(100))]);
    expect(s.ricavi.valore).toBe(300); expect(s.totaleCosti).toBe(180); expect(s.costi.pedaggi.valore).toBeNull();
  });
  it("giorni nel mese e canoni pro-rata, sostitutivi esclusi", () => {
    expect(giorniNelMese("2026-10", "2026-10-17", null)).toBe(15);
    expect(giorniNelMese("2026-10", "2026-01-01", "2026-09-30")).toBe(0);
    expect(canoniMese("2026-10", [
      { station: "DER1", da: "2026-01-01", a: "2026-10-15", canone: 620, sostitutivo: false },
      { station: "GLS", da: "2026-10-16", a: null, canone: 620, sostitutivo: false },
      { station: "GLS", da: "2026-01-01", a: null, canone: 500, sostitutivo: true },
    ])).toEqual({ DER1: 300, GLS: 320 });
  });
  it("lavoro GLS e fattura open book", () => {
    const m = { bustaSic: 100000, accStraord: 2000, accFerie: 3000, std: 10000, teste: 50, danni: 0, altri: 0 };
    expect(lavoroGls(m, { ...m, accStraord: 1000, accFerie: 1000 })).toBe(113000);
    expect(lavoroGls(m, null)).toBe(115000);
    expect(fatturaOpenBook({ lavoroPrec: 100000, mezziPrec: 20000, carburantePrec: 10000, pedaggiPrec2: 1000, teste: 10 })).toBe(Math.round((131000 + 1666.7) * 1.07 * 1.065 * 100) / 100);
    expect(fatturaOpenBook({ lavoroPrec: null, mezziPrec: 1, carburantePrec: 1, pedaggiPrec2: 1, teste: 1 })).toBeNull();
  });
});
