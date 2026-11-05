import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { foglioFO, leggiZtl, mesePrima, noleggiFO, quotaCanone, rigaNoleggio, ztlDelMese } from "@/domain/costi/fo";
import { excelFO } from "@/lib/costi/excelFO";

describe("F.O.: noleggi", () => {
  it("riga per società come nel file F.O.", () => {
    expect(["ALD MT", "ALD", "Ayvens", "Arval", "Avis", "Europcar", "Noleggiare", "Vem", "Hertz", "Autovia", "NoloExpress", "Torental"].map(rigaNoleggio)).toEqual([15, 16, 16, 6, 9, 10, 11, 12, 13, 14, 17, 17]);
  });
  it("canone pro-rata sui giorni del mese; sostitutivi e dismessi senza data esclusi", () => {
    const base = { station: "DER2", stato: "ATTIVO", leasingCompany: "Europcar", canoneMese: 930, inizio: "2026-10-16", fine: null };
    expect(quotaCanone(base, "2026-10")).toBeCloseTo((930 * 16) / 31, 6); // dal 16 al 31 ottobre
    expect(quotaCanone({ ...base, inizio: "2026-01-01" }, "2026-10")).toBe(930);
    expect(quotaCanone({ ...base, inizio: "2026-01-01", stato: "DISMESSO", fine: "2026-10-10" }, "2026-10")).toBeCloseTo(300, 6);
    expect(quotaCanone({ ...base, stato: "SOSTITUTIVO" }, "2026-10")).toBe(0);
    expect(quotaCanone({ ...base, stato: "DISMESSO", fine: null }, "2026-10")).toBe(0);
    const n = noleggiFO([{ ...base, inizio: "2026-01-01" }, { ...base, inizio: "2026-01-01", station: "GLS" }, { ...base, inizio: "2026-01-01", leasingCompany: "NoloExpress" }], "2026-10");
    expect(n.map((c) => [c.riga, c.station, c.importo])).toEqual([[10, "DER2", 930], [17, "DER2", 930]]);
  });
});

describe("F.O.: ZTL Rimini/Cesena", () => {
  it("permessi con data di richiesta nel mese × importo; note di testo ignorate", () => {
    const p = leggiZtl([["ZTL", "TARGA", "MODELLO", "DATA RICHIESTA AUTORIZZAZIONE", "DAL", "AL", "NOTE"], ["RIMINI", "AA000AA", "x", new Date("2026-09-12"), new Date("2026-09-15"), new Date("2026-09-18"), 15.95], ["RIMINI", "BB000BB", "x", new Date("2026-09-20"), null, null, "inviata richiesta"], ["CESENA", "CC000CC", "x", new Date("2026-10-01"), null, null, 15.95]]);
    expect(ztlDelMese(p, "2026-09")).toEqual({ permessi: 1, importo: 15.95, senzaImporto: 1 });
  });
  const f = path.join(process.cwd(), "docs", "costi-kit", "esempi", "fo", "TARGHE_ZTL_RIMINI_CESENA.xlsx");
  it.skipIf(!fs.existsSync(f))("file reale: settembre 622,05 € (= F.O. E55), ottobre 606,10 €", async () => {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f);
    const righe: unknown[][] = [];
    wb.getWorksheet("Sheet1")!.eachRow({ includeEmpty: true }, (r, n) => { righe[n - 1] = (r.values as unknown[]).slice(1); });
    const p = leggiZtl(Array.from(righe, (r) => r ?? []));
    expect(ztlDelMese(p, "2026-09")).toMatchObject({ permessi: 39, importo: 622.05 });
    expect(ztlDelMese(p, "2026-10")).toMatchObject({ permessi: 38, importo: 606.1 });
  });
});

describe("F.O.: foglio", () => {
  it("nome e formula del costo SIC: busta del mese ± accantonamenti, trasferte non sommate (già in busta)", () => {
    expect(foglioFO("2026-10")).toBe("AMZ Ott 2026");
    expect(mesePrima("2026-01")).toBe("2025-12");
    const wb = excelFO({ mese: "2026-10", carburante: { DER1: 100 }, noleggi: [{ riga: 16, station: "DER2", importo: 500, mezzi: 1, societa: ["ALD"] }], telepass: { DER1: 50 }, ztl: { importo: 606.1, permessi: 38 },
      accStraord: { DER1: 10 }, accFerie: { DER1: 5 }, bustaSic: 1000, bustaNota: "", costoStd: 300, fatturato: 2000, fatturatoNota: "", wind: 1500, elmec: 119.9 });
    const ws = wb.getWorksheet("AMZ Ott 2026")!;
    expect([ws.getCell("D3").value, ws.getCell("E16").value, ws.getCell("D53").value, ws.getCell("E55").value, ws.getCell("D60").value, ws.getCell("D61").value]).toEqual([100, 500, 50, 606.1, 10, 5]);
    expect((ws.getCell("P60").value as { formula: string }).formula).toBe("P58-'AMZ Set 2026'!L60+'AMZ Set 2026'!L61+K60-K61+K67");
    expect([ws.getCell("O58").value, ws.getCell("P58").value, ws.getCell("P57").value]).toEqual(["Busta SIC del mese", 1000, null]);
    expect((ws.getCell("P62").value as { formula: string }).formula).toBe("SUM(D6:J17)");
    expect(ws.getCell("C40").value).toBe("Multe 2026");
  });
});

describe("F.O.: tabellina della busta SIC", async () => {
  const { vociBusta } = await import("@/domain/costi/fo");
  it("stima salvata: le voci sommano al TOTALE per DS; payroll: tutte le componenti", () => {
    const righe = [["BASE", 1000], ["TRASFERTA", 100], ["ISTITUTI", 180], ["STRAORDINARI", 50], ["FESTIVITA", 30], ["ASSENZE", -40], ["MALATTIA", -25], ["ALTRE_ASSENZE", -15], ["FERIE_GODUTE", -60], ["TOTALE", 1080]].map(([voce, importo]) => ({ station: "DER1", voce: voce as string, importo: importo as number }));
    const v = vociBusta(righe, "stima");
    expect(v.length).toBe(7);
    expect(v.reduce((a, x) => a + (x.perDs.DER1 ?? 0), 0)).toBe(1080);
    // stima salvata prima della scomposizione: istituti senza trasferta
    const vecchia = vociBusta(righe.filter((r) => !["STRAORDINARI", "FESTIVITA", "MALATTIA", "ALTRE_ASSENZE"].includes(r.voce)), "stima");
    expect(vecchia.map((x) => x.perDs.DER1)).toEqual([1000, 100, 80, -40, -60]);
    const pay = vociBusta([{ station: "DER1", voce: "BASE", importo: 500 }, { station: "DER1", voce: "ONERI", importo: 200 }, { station: "", voce: "RATEI_FERIE", importo: -10 }], "payroll");
    expect([pay[0].perDs.DER1, pay[5].perDs["senza DS"]]).toEqual([700, -10]);
    const wb = excelFO({ mese: "2026-10", carburante: null, noleggi: [], telepass: null, ztl: null, accStraord: null, accFerie: null, bustaSic: 1080, bustaNota: "", bustaVoci: v, costoStd: null, fatturato: null, fatturatoNota: "", wind: 0, elmec: 0 });
    const ws = wb.getWorksheet("AMZ Ott 2026")!;
    expect([ws.getCell("C78").value, ws.getCell("D80").value, ws.getCell("C87").value]).toEqual(["Busta SIC del mese (P58): da cosa nasce", 1000, "= Busta del mese"]);
    expect((ws.getCell("L88").value as { formula: string }).formula).toBe("ROUND(L87-P58,2)");
  });
});
