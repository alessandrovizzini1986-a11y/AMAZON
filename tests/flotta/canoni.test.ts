import { describe, it, expect } from "vitest";
import { stimaCanone } from "@/domain/flotta/canoni";

const m = (targa: string, stato: string, societa: string, modello: string, tipo: string, canone: number | null) => ({ targa, stato, societa, modello, tipo, canone });

describe("canone stimato dei mezzi senza fattura", () => {
  it("mediana dei mezzi uguali, poi stessa società e tipo; sostitutivi e dismessi esclusi", () => {
    const s = stimaCanone([
      m("AA000AA", "ATTIVO", "Hertz", "Ford Transit", "BT", 900), m("AA001AA", "ATTIVO", "Hertz", "Ford Transit", "BT", 1000), m("AA002AA", "ATTIVO", "Hertz", "Ford Transit", "BT", 800),
      m("AA003AA", "DISMESSO", "Hertz", "Ford Transit", "BT", 5000), m("AA004AA", "SOSTITUTIVO", "Hertz", "Ford Transit", "BT", 3000),
      m("BB000BB", "ATTIVO", "Hertz", "Ford Transit", "BT", null),
      m("BB001BB", "ATTIVO", "Hertz", "Fiat Scudo", "BT", null),
      m("BB002BB", "SOSTITUTIVO", "Hertz", "Fiat Scudo", "BT", null),
      m("BB003BB", "ATTIVO", "Arval", "Renault Kangoo", "BT", 0),
    ]);
    expect(s.map((x) => [x.targa, x.canone])).toEqual([["BB000BB", 900], ["BB001BB", 900], ["BB003BB", null]]);
    expect(s[1].base).toBe("mediana di 3 mezzi Hertz BT");
  });
});
