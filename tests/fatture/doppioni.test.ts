import { describe, expect, it } from "vitest";
import { possibiliDoppioni, totaliFattura } from "@/domain/fatture/doppioni";

const r = (id: string, data: string, avere: number, descrizione = "x", quantita = 1) => ({ id, data, quantita, avere, descrizione });

describe("righe doppie", () => {
  it("stessa data, quantità e importo anche con descrizione diversa", () => {
    const g = possibiliDoppioni([r("a", "2026-04-05", 120, "Incentivi - Parcheggio"), r("b", "2026-04-05", 120, "Incentivi - Pedaggi"), r("c", "2026-04-06", 120), r("d", "2026-04-05", 0), r("e", "2026-04-05", 0)]);
    expect(g.map((x) => x.map((y) => y.id))).toEqual([["a", "b"]]);
  });
  it("le rotte uguali nello stesso giorno non sono doppie", () => {
    expect(possibiliDoppioni([r("a", "2026-01-03", 272.5, "Nursery Route Level 4 - Block of 8 Hours 24 Minutes"), r("b", "2026-01-03", 272.5, "ORDT Parcel - Block of 8 Hours 24 Minutes")])).toEqual([]);
  });
  it("quantità diversa non è doppia", () => {
    expect(possibiliDoppioni([r("a", "2026-04-05", 10, "x", 1), r("b", "2026-04-05", 10, "x", 2)])).toEqual([]);
  });
  it("totali ricalcolati", () => {
    expect(totaliFattura([{ totale: 12.2, avere: 10 }, { totale: 24.4, avere: 20 }])).toEqual({ nRighe: 2, sommaTotale: 36.6, sommaAvere: 30 });
  });
});
