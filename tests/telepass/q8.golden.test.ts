import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import { leggiCensimento } from "@/domain/telepass/anagrafiche";
import { elaboraQ8, type EsitoQ8 } from "@/domain/telepass/q8";
import { excelQ8 } from "@/lib/telepass/excelQ8";
import { atteso, confronta, esempio, grids, hasKit, hasOpenpyxl, tmp } from "./kit";

describe.skipIf(!hasKit)("Q8 ottobre 2026 — golden", () => {
  let e: EsitoQ8;
  beforeAll(async () => {
    const cens = leggiCensimento(await grids(esempio("1026_Censimento_fuel_card.xlsx")));
    e = elaboraQ8(await grids(esempio("10_Transazioni_Ottobre_26_Q8.xlsx")), cens);
  }, 120_000);

  it("4.110 righe tenute su 4.927 (817 scartate: il prompt dice 818/4.928, lo script e l'atteso danno 817), ottobre 2026, settimane 40–44", () => {
    expect([e.righeExport, e.tenute, e.scartate.reduce((s, x) => s + x.n, 0)]).toEqual([4927, 4110, 817]);
    expect([e.anno, e.mese, e.nomeFile]).toEqual([2026, 10, "10_Transazioni_Ottobre_26_Q8.xlsx"]);
    expect(e.settimane).toEqual([40, 41, 42, 43, 44]);
  });

  it("Imp. Scontato no IVA: totale 282.166,73 e totali per station", () => {
    expect(e.totale).toBe(282166.73);
    expect(e.perStation).toEqual({ DER1: 36346.77, DER2: 39710.1, DLO2: 54383.71, DLO4: 17190.62, DLO5: 34133.42, DLZ2: 29663.38, DVN1: 46444.61, GLS: 24294.11 });
  });

  it("3 carte abbinate per Identificativo (PAN riemesso), nessuna non censita", () => {
    expect(e.perIdentificativo.map((x) => [x.identificativo, x.station, x.n])).toEqual([["AMZ593", "DLO5", 9], ["AMZ489", "DLZ2", 4], ["AMZ464", "DLO2", 3]]);
    expect(e.perIdentificativo.reduce((s, x) => s + x.n, 0)).toBe(16);
    expect(e.nonCensite).toEqual([]);
  });

  it.skipIf(!hasOpenpyxl)("Excel identico all'atteso cella per cella (valori, formule, formati)", async () => {
    const out = tmp(e.nomeFile);
    fs.writeFileSync(out, Buffer.from(await excelQ8(e).xlsx.writeBuffer()));
    const c = confronta(out, atteso("10_Transazioni_Ottobre_26_Q8.xlsx"));
    expect(c.differenze, c.output).toBe(0);
  }, 300_000);
});
