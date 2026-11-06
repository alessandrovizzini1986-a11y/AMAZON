import { describe, it, expect } from "vitest";
import { classificaRighe, costoParcheggio, fatturaStornata, nuoviStd, recapVoce, totaliRun, voceRimborso, type VoceRimborso } from "@/domain/fatture/rimborsi";

const PAR = [
  { chiave: "PARCHEGGIO_DER2", validaDal: "2026-10-01", valore: 3500 },
  { chiave: "PARCHEGGIO_DER2", validaDal: "2027-01-16", valore: 0 },
  { chiave: "PARCHEGGIO_DLO2", validaDal: "2026-01-01", valore: 4115 },
  { chiave: "PARCHEGGIO_DLO2", validaDal: "2026-11-15", valore: 0 },
  { chiave: "PARCHEGGIO_DER1", validaDal: "2026-01-01", valore: 3020 },
];

describe("voci di rimborso", () => {
  it("riconosce le descrizioni delle fatture Amazon", () => {
    expect(voceRimborso("Incentivi - Parcheggio")).toBe("PARCHEGGI");
    for (const d of ["Pedaggi", "Modifiche - Pedaggi", "Incentivi - Pedaggi", "Rimborso - pedaggi"]) expect(voceRimborso(d)).toBe("PEDAGGI");
    expect(voceRimborso("FuelAllowance")).toBe("CARBURANTE");
    expect(voceRimborso("Fuel Allowance")).toBe("CARBURANTE");
    expect(voceRimborso("Training Day - Block of 7 Hours 48 Minutes")).toBe("TRAINING");
    expect(voceRimborso("Standard Parcel - Block of 9 Hours")).toBeNull();
    expect(fatturaStornata("Credit Note for INV-IT3JDBF-0002366 dated 2026/07/22")).toBe("INV-IT3JDBF-0002366");
  });

  it("la nota credito va nella voce della fattura stornata, DVN5 in DVN1", () => {
    const voci = new Map<string, VoceRimborso>([["INV-X-2", "PARCHEGGI"]]);
    const r = classificaRighe([
      { numero: "INV-X-1", ds: "DLO2", data: "2026-05-01", descrizione: "Incentivi - Parcheggio", quantita: 1, avere: 8430 },
      { numero: "INV-X-2", ds: "DLO2", data: "2026-05-01", descrizione: "Incentivi - Parcheggio", quantita: 1, avere: 8430 },
      { numero: "INV-X-3", ds: "DLO2", data: "2026-05-01", descrizione: "Credit Note for INV-X-2 dated 2026/07/22", quantita: 1, avere: -8430 },
      { numero: "INV-X-4", ds: "DVN5", data: "2026-05-09", descrizione: "FuelAllowance", quantita: 100, avere: 18 },
      { numero: "INV-X-5", ds: "DLO2", data: "2026-05-09", descrizione: "Credit Note for INV-Z-9", quantita: 1, avere: -5 },
    ], voci);
    expect(r).toHaveLength(4);
    expect(r.find((x) => x.numero === "INV-X-4")!.ds).toBe("DVN1");
    const p = recapVoce("PARCHEGGI", "2026-05", r, (ds) => costoParcheggio(PAR, ds, "2026-05"), "", ["DLO2", "DER1"]);
    expect(p.perDs.DLO2).toMatchObject({ costo: 4115, rimborsato: 8430, differenza: 4315, storni: 1 });
    expect(p.perDs.DER1).toMatchObject({ costo: 3020, rimborsato: 0, differenza: -3020 });
    expect(p.totale.differenza).toBe(1295);
  });

  it("costo parcheggio pro-rata: DLO2 fino al 14/11, DER2 gennaio 2027 metà", () => {
    expect(costoParcheggio(PAR, "DLO2", "2026-10")).toBe(4115);
    expect(costoParcheggio(PAR, "DLO2", "2026-11")).toBeCloseTo((4115 * 14) / 30, 2);
    expect(costoParcheggio(PAR, "DLO2", "2026-12")).toBe(0);
    expect(costoParcheggio(PAR, "DER2", "2026-09")).toBe(0);
    expect(costoParcheggio(PAR, "DER2", "2026-12")).toBe(3500);
    expect(costoParcheggio(PAR, "DER2", "2027-01")).toBeCloseTo((3500 * 15) / 31, 2);
    expect(costoParcheggio(PAR, "DLO4", "2026-10")).toBe(0);
  });

  it("training atteso dai nuovi STD e totali Telepass/Q8 per DS", () => {
    expect(nuoviStd([{ station: "DER1", dataInizio: "2026-09-03" }, { station: "DER1", dataInizio: "2026-08-30" }, { station: "DVN6", dataInizio: "2026-09-10" }, { station: null, dataInizio: "2026-09-01" }], "2026-09")).toEqual({ DER1: 1, DVN1: 1 });
    expect(totaliRun({ DER1: { "40": -100.5, "41": -50 }, "GLS - CASTEL MAGGIORE": { "40": -9 }, SEDE: 5, DVN1: 10 }, ["DER1", "DVN1"])).toEqual({ DER1: 150.5, DVN1: 10 });
  });
});
