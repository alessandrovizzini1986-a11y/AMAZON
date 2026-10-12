import { describe, it, expect } from "vitest";
import { parseOrderDate, mapAyvensRows, orderPhase, isoWeek, weekRecap } from "@/domain/orders";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("parseOrderDate", () => {
  it("legge date vere, testo italiano, ISO e seriali Excel", () => {
    expect(parseOrderDate(new Date("2026-09-03T00:00:00Z"))).toEqual(d("2026-09-03"));
    expect(parseOrderDate("19/10/2026")).toEqual(d("2026-10-19"));
    expect(parseOrderDate("2026-08-05T00:00:00+02:00")).toEqual(d("2026-08-05"));
    expect(parseOrderDate(46268)).toEqual(d("2026-09-03"));
  });
  it("scarta vuoti, errori Excel e date impossibili", () => {
    expect(parseOrderDate(null)).toBeNull();
    expect(parseOrderDate("")).toBeNull();
    expect(parseOrderDate("#VALUE!")).toBeNull();
    expect(parseOrderDate("31/02/2026")).toBeNull();
  });
});

describe("isoWeek", () => {
  it("coincide con la WEEK del file Ayvens", () => {
    expect(isoWeek(d("2026-09-03")).week).toBe(36);
    expect(isoWeek(d("2026-10-09")).week).toBe(41);
    expect(isoWeek(d("2026-10-14")).week).toBe(42);
    expect(isoWeek(d("2027-01-01"))).toMatchObject({ year: 2026, week: 53 });
  });
});

describe("mapAyvensRows", () => {
  const headers = ["Id_Ordine", "Ref_Ordine", "Targa", "Stato", "Prevista Consegna", "DATA RITIRO", "Modello", "Punto Di Ritiro Del Veicolo"];
  it("mappa le colonne e normalizza targa e date", () => {
    const [o] = mapAyvensRows(headers, [["42036245", 42036245, " he264vh ", "Da ritirare", "03/09/2026", null, "JUMPER", "TORRI"]]);
    expect(o).toMatchObject({ refOrdine: "42036245", targa: "HE264VH", statoFornitore: "Da ritirare", previstaConsegna: d("2026-09-03"), dataRitiro: null, puntoRitiro: "TORRI" });
  });
  it("salta righe senza numero ordine e tiene l'ultima in caso di duplicati", () => {
    const out = mapAyvensRows(headers, [[null, null, "X", "a"], ["1", 1, "", "Prima"], ["1", 1, "", "Dopo"]]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ targa: null, statoFornitore: "Dopo" });
  });
  it("rifiuta un file senza colonna ordine", () => {
    expect(() => mapAyvensRows(["Targa"], [])).toThrow(/Ref_Ordine/);
  });
});

describe("orderPhase / weekRecap", () => {
  const today = d("2026-10-12");
  it("classifica per data ritiro rispetto a oggi", () => {
    expect(orderPhase({ dataRitiro: d("2026-10-12") }, today)).toBe("RITIRATO");
    expect(orderPhase({ dataRitiro: d("2026-10-14") }, today)).toBe("RITIRO_FISSATO");
    expect(orderPhase({ dataRitiro: null }, today)).toBe("IN_ARRIVO");
  });
  it("raggruppa per settimana della data ritiro, altrimenti della consegna prevista", () => {
    const rows = weekRecap(
      [
        { dataRitiro: d("2026-10-09"), previstaConsegna: d("2026-10-19") },
        { dataRitiro: d("2026-10-14"), previstaConsegna: d("2026-10-19") },
        { dataRitiro: null, previstaConsegna: d("2026-10-19") },
        { dataRitiro: null, previstaConsegna: null },
      ],
      today,
    );
    expect(rows.map((r) => [r.key, r.ritirati, r.fissati, r.inArrivo])).toEqual([
      ["2026-W41", 1, 0, 0],
      ["2026-W42", 0, 1, 0],
      ["2026-W43", 0, 0, 1],
      ["nd", 0, 0, 1],
    ]);
  });
});
