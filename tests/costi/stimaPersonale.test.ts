import { describe, it, expect } from "vitest";
import { blocchiDaCalcolo, foglioStimaPersonale, nomeFoglio, tipoStd, NOTE_MODELLO } from "@/lib/costi/excelStimaPersonale";
import { isZucchettiName, stationFromZucchettiName } from "@/domain/presenze/controlloFineMese";

const tar = { trasf: 22.5, trasfDom: 29.5, STANDARD: 20.86, STR30: 20.11, SUPP18: 18.25, MAGG50: 28.56, STR65: 25.52, SUPP65: 25.52 };
const ore = { standard: 100, standardDF: 10, straord: 5, straordDom: 2, suppl: 8, supplDom: 1, trasfGg: 12, trasfDom: 2 };

describe("foglio per Stima_Costo_personale", () => {
  it("nome e struttura come AMZ_OTT_26: blocchi da G, 5 colonne per station", () => {
    expect(nomeFoglio("2026-10")).toBe("AMZ_OTT_26");
    const b = blocchiDaCalcolo({
      sic: [{ station: "DER2", bucket: "CTI FT", cdl: 3000, ...ore }, { station: "DER2", bucket: "CTI FT", cdl: 3200, ...ore }, { station: "DER2", bucket: "DISPATCHER", cdl: 4000, ...ore }],
      std: [{ station: "DER2", ...ore }], testeStd: { DER2: { ft: 0, pt: 3, mog: 20 } }, altreStd: { DER2: 1234.5 },
    });
    const wb = foglioStimaPersonale({ mese: "2026-10", blocchi: b, cdlBase: 10200, tariffe: tar, fonte: "test" });
    const ws = wb.getWorksheet("AMZ_OTT_26")!;
    // DER2 = blocco L..P
    expect(ws.getCell("L3").value).toBe("DER2");
    expect([ws.getCell("M8").value, ws.getCell("N8").value, ws.getCell("M11").value]).toEqual([2, 3100, 1]);
    expect([ws.getCell("M34").value, ws.getCell("N34").value, ws.getCell("N36").value, ws.getCell("N39").value, ws.getCell("N43").value, ws.getCell("N45").value]).toEqual([300, 100, 10, 2, 12, 2]);
    expect([ws.getCell("M20").value, ws.getCell("M21").value]).toEqual([3, 20]);
    // Standard STD costato = totale − MAGG (niente doppia sottrazione)
    expect((ws.getCell("N35").value as { formula: string }).formula).toBe("+N34-N36");
    expect((ws.getCell("M22").value as { formula: string }).formula).toBe("+N35");
    // correzioni del modello: riga 2 sul proprio blocco, DER2 nei totali
    expect((ws.getCell("L2").value as { formula: string }).formula).toBe("SUM(M37:N37,M34:N34,M40:N40)");
    expect((ws.getCell("F6").value as { formula: string }).formula).toContain("P6");
    expect((ws.getCell("F43").value as { formula: string }).formula).toContain("M43");
    expect((ws.getCell("C30").value as { formula: string }).formula).toContain("M30");
    expect(NOTE_MODELLO.length).toBe(3);
    // altre voci ADIT: TOT. COSTO STD = ore + trasferte + altre voci (= stima del sito = P61 Costi F.O.)
    expect(ws.getCell("O32").value).toBe(1234.5);
    expect((ws.getCell("B5").value as { formula: string }).formula).toBe("+F22+F28+F32");
    expect((ws.getCell("L5").value as { formula: string }).formula).toBe("+P22+P28+P32");
  });
  it("tipo STD dal contratto del tracking", () => {
    expect(["MOG 35", "MOG 48,37% SBC", "STD PT 60", "STD PT 32,5H SBC", "STD FT"].map(tipoStd)).toEqual(["mog", "mog", "pt", "pt", "ft"]);
  });
  it("Zucchetti: Santarcangelo in ogni grafia è DER2", () => {
    for (const n of ["Amazon_2026_10_SantArcangelo_inizio_43ore.xlsm", "Amazon_2026_10_Sant'Arcangelo_inizio.xlsm", "Amazon_2026_10_Sant Arcangelo di Romagna.xlsm", "Amazon_2026_10_Rimini_inizio.xlsm"]) {
      expect(stationFromZucchettiName(n)).toBe("DER2");
      expect(isZucchettiName(n)).toBe(true);
    }
  });
});

describe("tariffe STD dall'ADIT", async () => {
  const { tariffeDaAdit } = await import("@/domain/costi/adit");
  it("CTRB Decr. Dignità = € CTRB / ore fatturate; senza ore null", () => {
    const t = tariffeDaAdit([{ voce: "STANDARD", quantita: 900, costo: 18774 }, { voce: "MAGG50", quantita: 100, costo: 2856 }, { voce: "CTRB_DIGNITA", quantita: 0, costo: 28 }]);
    expect(t.CTRB_H).toBeCloseTo(0.028, 6);
    expect(tariffeDaAdit([{ voce: "CTRB_DIGNITA", quantita: 0, costo: 5 }]).CTRB_H).toBeNull();
  });
});
