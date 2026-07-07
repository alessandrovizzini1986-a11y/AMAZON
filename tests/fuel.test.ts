import { describe, it, expect } from "vitest";
import { consumoL100km, isConsumoAnomalo } from "@/domain/fuel";

describe("riconciliazione carburante", () => {
  it("calcola litri/100km", () => {
    expect(consumoL100km(110, 1000)).toBe(11);
  });
  it("null con km non validi (no divisioni per zero)", () => {
    expect(consumoL100km(50, 0)).toBeNull();
  });
  it("anomalia oltre tolleranza configurata", () => {
    expect(isConsumoAnomalo({ consumoRilevato: 14, consumoAtteso: 11, tolleranza: 0.25 })).toBe(true);
    expect(isConsumoAnomalo({ consumoRilevato: 13, consumoAtteso: 11, tolleranza: 0.25 })).toBe(false);
    expect(isConsumoAnomalo({ consumoRilevato: null, consumoAtteso: 11, tolleranza: 0.25 })).toBe(false);
  });
});
