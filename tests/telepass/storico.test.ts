import { describe, it, expect } from "vitest";
import { meseDaNome, perStationRun, storicoQ8, storicoTelepass } from "@/domain/telepass/storico";

describe("file Q8 e Telepass già elaborati", () => {
  it("Q8: somma per STATION e settimana Excel; GLS - CASTELMAGGIORE → GLS; mese prevalente", () => {
    const m = [
      ["Cod. Main", "Data", "STATION", "Imp. Scontato no IVA"],
      ["1", new Date(Date.UTC(2026, 0, 31)), "DLO2", 61.48],
      ["1", 46053, "DLO2", 10], // 31/01/2026 come seriale Excel
      ["1", new Date(Date.UTC(2026, 0, 30)), "GLS - CASTELMAGGIORE", 50],
      ["1", new Date(Date.UTC(2026, 0, 12)), "", 5],
      ["1", null, "DER1", 7],
    ];
    const r = storicoQ8(m);
    expect([r.anno, r.mese, r.righe, r.senzaStation]).toEqual([2026, 1, 3, 1]);
    expect(r.totali).toEqual({ DLO2: { "5": 71.48 }, GLS: { "5": 50 } });
    expect(perStationRun(r.totali)).toEqual({ DLO2: 71.48, GLS: 50 });
    expect(() => storicoQ8([["A", "B"]])).toThrow(/STATION/);
  });
  it("Telepass: pivot PVT con settimane, RMPP e ZTL; si ferma a Totale complessivo", () => {
    const m = [
      [null, null, "oggetto"],
      ["Somma di Importo", "Etichette di colonna"],
      ["Etichette di riga", "40", 41, "Totale complessivo", "RMPP", "ZTL", "TOTALE"],
      ["DER1", -471.65, -1318, -1789.65, null, null, 1789.65],
      ["DER2", -296, -676.8, -972.8, 10, 606.1, 1588.9],
      ["Totale complessivo", -767.65, -1994.8],
      ["DLO2", -1, -1],
    ];
    const r = storicoTelepass(m);
    expect(r.totali).toEqual({ DER1: { "40": -471.65, "41": -1318 }, DER2: { "40": -296, "41": -676.8, RMPP: -10, ZTL: -606.1 } });
    expect(r.perStation).toEqual({ DER1: 1789.65, DER2: 1588.9 });
  });
  it("mese dal nome del file", () => {
    expect(meseDaNome("07_Telepass_Luglio_2026.xlsx")).toEqual({ anno: 2026, mese: 7 });
    expect(meseDaNome("01_Transazioni_Gennaio_26_Q8.xlsx")).toEqual({ anno: 2026, mese: 1 });
    expect(meseDaNome("pippo.xlsx")).toBeNull();
  });
});
