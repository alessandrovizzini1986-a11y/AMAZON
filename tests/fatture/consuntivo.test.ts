import { describe, expect, it } from "vitest";
import { annoDaNome, leggiConsuntivo, totaliMeseVoce } from "@/domain/fatture/consuntivo";

const H = ["Mese", "Category code", "CDC", "Tipologia Costo", "Zona", "Costo Effettivo"];
const m = [["titolo"], [], H,
  ["Gennaio", "COSTO", "5569 - TRASPORTO", "CARBURANTE", "DER1", 100.5],
  ["Gennaio", "COSTO", "5569 - TRASPORTO", "CARBURANTE", "der1 ", 50],
  ["Gennaio", "COSTO", "5569 - TRASPORTO", "AFFITTI AMAZON", "DLO2", 4115],
  ["Febbraio", "COSTO", "5569 - TRASPORTO", "PEDAGGI", "DVN1", 20],
  ["Febbraio", "COSTO", "5565 - GLS", "PEDAGGI", "DVN1", 999],
  ["Febbraio", "COSTO", "5569 - TRASPORTO", "PEDAGGI", "SEDE", 7],
  ["Marzo", "COSTO", "5569 - TRASPORTO", "COSTO LAVORO", "DER1", 1000],
];

describe("consuntivo contabile", () => {
  it("somma per mese, DS e voce; solo CDC 5569 e DS validi", () => {
    const r = leggiConsuntivo(m, 2025);
    expect(r.righe).toEqual([
      { anno: 2025, mese: 1, ds: "DER1", voce: "CARBURANTE", importo: 150.5 },
      { anno: 2025, mese: 1, ds: "DLO2", voce: "PARCHEGGI", importo: 4115 },
      { anno: 2025, mese: 2, ds: "DVN1", voce: "PEDAGGI", importo: 20 },
    ]);
    expect(r.scartate).toBe(1);
    expect(totaliMeseVoce(r.righe)["1|CARBURANTE"]).toBe(150.5);
  });
  it("anno dal nome e errore senza intestazione", () => {
    expect(annoDaNome("consuntivo_costi_fatturato_2025.xlsx")).toBe(2025);
    expect(annoDaNome("a2083f68-consuntivo_costi_fatturato_2025.xlsx")).toBe(2025);
    expect(annoDaNome("consuntivo.xlsx")).toBeNull();
    expect(() => leggiConsuntivo([["a"]], 2025)).toThrow(/SOLITO/);
  });
});
