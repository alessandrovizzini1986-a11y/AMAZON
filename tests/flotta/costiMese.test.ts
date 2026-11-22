import { describe, it, expect } from "vitest";
import { annoPrima, compagniaMail, confronto, mesePrima, nomeMese, splitCosti, type RigaCosto } from "@/domain/flotta/costiMese";

const v = (compagnia: string | null, canone: number | null, amazon = true, stimato = false) => ({ compagnia, canone, amazon, stimato });

describe("costo dei furgoni per compagnia di noleggio", () => {
  it("ALD e ALD MT in una riga; Amazon e GLS separati; canoni stimati contati a parte", () => {
    const r = splitCosti([v("ALD", 500), v("ALD MT", 900, true, true), v("Europcar", 1000), v("ALD", 600, false), v(null, null)]);
    expect(r).toEqual([
      { appalto: "AMAZON", compagnia: "ALD", mezzi: 2, canone: 1400, stimati: 1 },
      { appalto: "AMAZON", compagnia: "Europcar", mezzi: 1, canone: 1000, stimati: 0 },
      { appalto: "AMAZON", compagnia: "Senza compagnia", mezzi: 1, canone: 0, stimati: 0 },
      { appalto: "GLS", compagnia: "ALD", mezzi: 1, canone: 600, stimati: 0 },
    ]);
    expect([compagniaMail("ALD MT"), compagniaMail("Aldo Rent"), compagniaMail("")]).toEqual(["ALD", "Aldo Rent", "Senza compagnia"]);
  });
  it("differenze sul mese prima e sull'anno prima; senza dato la differenza resta vuota", () => {
    const riga = (compagnia: string, canone: number, appalto: "AMAZON" | "GLS" = "AMAZON"): RigaCosto => ({ appalto, compagnia, mezzi: null, canone, stimati: 0 });
    const c = confronto("AMAZON", [riga("ALD", 1400), riga("Europcar", 1000), riga("ALD", 600, "GLS")], [riga("ALD", 1000), riga("Hertz", 300)], null);
    expect(c.righe.map((r) => [r.compagnia, r.canone, r.dPrec, r.dAnno])).toEqual([["ALD", 1400, 400, null], ["Europcar", 1000, 1000, null], ["Hertz", 0, -300, null]]);
    expect(c.totale).toMatchObject({ canone: 2400, prec: 1300, dPrec: 1100, anno: null, dAnno: null });
    // nessun dato per il mese prima di quell'appalto: differenza vuota, non zero
    expect(confronto("GLS", [riga("ALD", 600, "GLS")], [riga("ALD", 1000)], null).totale.dPrec).toBeNull();
  });
  it("mesi di confronto e nomi", () => {
    expect([mesePrima("2026-11"), mesePrima("2026-01"), annoPrima("2026-11"), nomeMese("2026-11")]).toEqual(["2026-10", "2025-12", "2025-11", "novembre 2026"]);
  });
});
