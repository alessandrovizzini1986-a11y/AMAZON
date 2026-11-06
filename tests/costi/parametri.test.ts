import { describe, it, expect } from "vitest";
import { festiviAnno, pasqua, patrono, domenicaOFestivo, festiviMese } from "@/domain/costi/festivi";
import { prossimoCambio, trasfertaGiorno, type ValorePerData } from "@/domain/costi/tariffe";
import { differenzeCDL, leggiAnagraficaCDL, riepilogoCDL, trovaCDL } from "@/domain/costi/anagrafica";
import { esempio, grids, hasKit } from "./kit";

describe("join CF", () => {
  it("esatto, poi O↔0 sull'ultimo carattere", () => {
    const r = { cf: "AAABBB00A00A000O", cdl: 1 } as never;
    const idx = new Map([["AAABBB00A00A000O", r]]);
    expect(trovaCDL(" aaabbb00a00a000o ", idx)).toMatchObject({ corretto: false });
    expect(trovaCDL("AAABBB00A00A0000", idx)).toMatchObject({ corretto: true });
    expect(trovaCDL("AAABBB00A00A0001", idx)).toBeNull();
  });
});

describe("festivi e patroni", () => {
  it("Pasqua e patroni 2026", () => {
    expect(pasqua(2026)).toBe("2026-04-05");
    expect([patrono("DLO2", 2026), patrono("DLO4", 2026), patrono("DLO5", 2026), patrono("DER2", 2026)]).toEqual(["2026-09-13", "2026-09-20", "2026-05-10", "2026-09-29"]);
    const f = festiviAnno(2026);
    expect(f.filter((x) => x.station === "TUTTE").map((x) => x.data)).toEqual(["2026-01-01", "2026-01-06", "2026-04-06", "2026-04-25", "2026-05-01", "2026-06-02", "2026-08-15", "2026-11-01", "2026-12-08", "2026-12-24", "2026-12-25", "2026-12-26", "2026-12-31"]);
    expect(festiviMese(2026, 9, "DLO2", f).map((x) => x.data)).toEqual(["2026-09-13"]);
    expect(festiviMese(2026, 9, "DER1", f)).toEqual([]);
    expect([patrono("GLS", 2026), patrono("GLS", 2027)]).toEqual(["2026-11-30", "2027-11-30"]);
    expect([domenicaOFestivo("2026-11-30", "GLS", f), domenicaOFestivo("2026-11-30", "DER1", f)]).toEqual([true, false]);
    expect([domenicaOFestivo("2026-09-29", "DER2", f), domenicaOFestivo("2026-09-29", "DER1", f), domenicaOFestivo("2026-09-26", "DER1", f)]).toEqual([true, false, false]);
  });
});

describe("tariffe trasferta per data", () => {
  const t: ValorePerData[] = [
    { voce: "TRASFERTA", validaDal: "2025-05-01", valore: 20.5 }, { voce: "TRASFERTA", validaDal: "2026-01-01", valore: 22.5 },
    { voce: "TRASFERTA", validaDal: "2027-01-01", valore: 23.5 }, { voce: "TRASFERTA", validaDal: "2027-06-01", valore: 24 },
    { voce: "TRASFERTA_DOM_EXTRA", validaDal: "2025-05-01", valore: 7 },
  ];
  it("valore alla data, domenica +7, prossimo cambio con allerta 60/30/7", () => {
    expect([trasfertaGiorno(t, "2025-12-31", false), trasfertaGiorno(t, "2026-09-06", true), trasfertaGiorno(t, "2027-06-01", false)]).toEqual([20.5, 29.5, 24]);
    expect(prossimoCambio(t, "TRASFERTA", "2026-11-04")).toMatchObject({ validaDal: "2027-01-01", valore: 23.5, precedente: 22.5, giorni: 58, allerta: 60 });
    expect(prossimoCambio(t, "TRASFERTA", "2026-12-10")!.allerta).toBe(30);
    expect(prossimoCambio(t, "TRASFERTA", "2026-12-28")!.allerta).toBe(7);
    expect(prossimoCambio(t, "TRASFERTA", "2026-10-01")!.allerta).toBeNull();
  });
});

describe.skipIf(!hasKit)("anagrafica CDL 06/2026 (golden)", () => {
  it("403 teste, CDL totale 1.256.309,94, versione 2026-06", async () => {
    const a = leggiAnagraficaCDL(await grids(esempio("anagrafica", "DB_CDL_base_0626_AmazonGLS_BO.xlsx")));
    const r = riepilogoCDL(a.righe);
    expect(a.meseVersione).toBe("2026-06");
    expect(r.teste).toBe(403);
    expect(r.cdl).toBe(1256309.94);
    expect(Object.keys(r.perStation).sort()).toEqual(["DER1", "DER2", "DLO2", "DLO4", "DLO5", "DLZ2", "DVN1"]);
    // trappola O/0 nel CF: almeno un CF dell'anagrafica finisce con O
    const idx = new Map(a.righe.map((x) => [x.cf, x]));
    const conO = a.righe.find((x) => x.cf.endsWith("O"))!;
    expect(trovaCDL(conO.cf.slice(0, -1) + "0", idx)).toMatchObject({ corretto: true, riga: { cf: conO.cf } });
    expect(differenzeCDL(a.righe, a.righe)).toEqual({ entrati: [], usciti: [], cambiati: [] });
  });
});

describe("coefficienti alla data", async () => {
  const { parametriAlla, versioneParametri } = await import("@/domain/costi/parametri");
  it("tetto settimanale 43 → 42 dal 1/6/2026 → 41 da luglio 2027", () => {
    const t = [{ chiave: "TETTO_SETT_H", validaDal: "2025-01-01", valore: 43 }, { chiave: "TETTO_SETT_H", validaDal: "2026-06-01", valore: 42 }, { chiave: "TETTO_SETT_H", validaDal: "2027-07-01", valore: 41 }, { chiave: "SIC_MOLT_ONERI", validaDal: "2026-01-01", valore: 1.434 }];
    expect(parametriAlla(t, "2026-05-31")).toEqual({ TETTO_SETT_H: 43, SIC_MOLT_ONERI: 1.434 });
    expect(parametriAlla(t, "2026-09-30").TETTO_SETT_H).toBe(42);
    expect(parametriAlla(t, "2027-07-01").TETTO_SETT_H).toBe(41);
    expect(versioneParametri(t, "2026-09-30")).toBe("2026-06-01");
  });
});

describe("testo Teams", async () => {
  const { testoTeams } = await import("@/domain/costi/teams");
  it("tabella con totali e al massimo 3 avvisi per station, i più gravi", () => {
    const t = testoTeams("2026-09", [{ station: "DER1", std: 82043.59, stdTeste: 33, sic: 150000, sicTeste: 51, avvisi: [{ peso: 1, testo: "a" }, { peso: 3, testo: "b" }, { peso: 2, testo: "c" }, { peso: 0, testo: "d" }] }]);
    expect(t).toContain("settembre 2026");
    expect(t).toContain("| DER1 | 82.044 | 33 | 150.000 | 51 | b; c; a |");
    expect(t).toContain("| **Totale** | **82.044** | 33 | **150.000** | 51 | |");
  });
});
