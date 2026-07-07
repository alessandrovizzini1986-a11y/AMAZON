import { describe, it, expect } from "vitest";
import { autoMapColumns, coerceValue, validateRows, IMPORT_SPECS } from "@/domain/importing";

describe("autoMapColumns — mapping flessibile intestazioni", () => {
  it("mappa label esatte, alias e varianti di maiuscole/accenti", () => {
    const headers = ["TARGA", "Modello", "carburante", "Data Immatricolazione", "Sede", "canone giornaliero"];
    const m = autoMapColumns(headers, IMPORT_SPECS.vehicles);
    expect(m.targa).toBe(0);
    expect(m.modello).toBe(1);
    expect(m.alimentazione).toBe(2); // alias "carburante"
    expect(m.immatricolazione).toBe(3);
    expect(m.stationCode).toBe(4); // alias "sede"
    expect(m.canoneGiorno).toBe(5); // alias "canone giornaliero"
    expect(m.allestimento).toBeNull(); // assente → da rimappare in UI
  });
});

describe("coerceValue — date reali, non testo", () => {
  const dateField = { key: "d", label: "Data", required: true, type: "date" as const };

  it("accetta oggetti Date (xlsx con cellDates)", () => {
    const r = coerceValue(new Date(2026, 0, 15), dateField);
    expect(r.ok && (r.value as Date).getFullYear()).toBe(2026);
  });

  it("accetta formato italiano gg/mm/aaaa", () => {
    const r = coerceValue("15/01/2026", dateField);
    expect(r.ok && (r.value as Date).getMonth()).toBe(0);
    expect(r.ok && (r.value as Date).getDate()).toBe(15);
  });

  it("accetta seriali Excel", () => {
    // 45658 = 2025-01-01
    const r = coerceValue(45658, dateField);
    expect(r.ok && (r.value as Date).getUTCFullYear()).toBe(2025);
  });

  it("rifiuta testo non-data con motivo esplicito", () => {
    const r = coerceValue("gennaio", dateField);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("non è una data valida");
  });

  it("importi in formato italiano (1.234,56)", () => {
    const r = coerceValue("1.234,56", { key: "i", label: "Importo", required: true, type: "decimal" });
    expect(r.ok && r.value).toBe(1234.56);
  });

  it("enum normalizzato (spazi → underscore, case-insensitive)", () => {
    const r = coerceValue("diesel hvo", {
      key: "a", label: "Alimentazione", required: true, type: "enum",
      enumValues: ["DIESEL", "DIESEL_HVO"],
    });
    expect(r.ok && r.value).toBe("DIESEL_HVO");
  });
});

describe("validateRows — righe valide ed errori con motivo", () => {
  it("separa righe valide da righe con errori", () => {
    const spec = IMPORT_SPECS.leases;
    const mapping = { targa: 0, canoneGiorno: 1, leasingCompany: 2, contrattoLeasingNo: 3 };
    const rows = [
      ["GA123BC", "38,50", "Ayvens", "C-001"],
      ["", "40", "Leasys", null], // targa mancante
      ["GB456DE", "abc", "ALD", null], // canone non valido
    ];
    const results = validateRows(rows, mapping, spec);
    expect(results[0].ok).toBe(true);
    expect(results[0].data.canoneGiorno).toBe(38.5);
    expect(results[1].ok).toBe(false);
    expect(results[1].errors[0]).toContain("obbligatorio");
    expect(results[2].ok).toBe(false);
    expect(results[2].errors[0]).toContain("importo");
  });
});
