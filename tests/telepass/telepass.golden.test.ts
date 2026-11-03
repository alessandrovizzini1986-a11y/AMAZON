import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import { leggiMappaTelepass } from "@/domain/telepass/anagrafiche";
import { elaboraTelepass, totaleStation, type EsitoTelepass } from "@/domain/telepass/telepass";
import { excelTelepass } from "@/lib/telepass/excelTelepass";
import { atteso, confronta, csv, esempio, grids, hasKit, hasOpenpyxl, tmp } from "./kit";

describe.skipIf(!hasKit)("Telepass ottobre 2026 — golden (regola Area C spenta: atteso dello script)", () => {
  let e: EsitoTelepass;
  beforeAll(async () => {
    const mappa = leggiMappaTelepass(await grids(esempio("TBusiness_carica_veicoli.xlsx")));
    e = elaboraTelepass(csv(esempio("_lista_transazioni_03-11-2026_15-47.csv")), new Map(mappa.map((d) => [d.codice, d.station])), { regolaAreaC: false });
  }, 120_000);

  it("15.618 righe, ottobre 2026, settimane 40–44, totale −39.738,80", () => {
    expect(e.righe.length).toBe(15618);
    expect([e.anno, e.mese, e.nomeFile]).toEqual([2026, 10, "10_Telepass_Ottobre_2026.xlsx"]);
    expect(e.settimane).toEqual([40, 41, 42, 43, 44]);
    expect(e.totale).toBe(-39738.8);
    expect(e.fuoriMese).toBe(0);
  });

  it("totali per station e VALERIO/VIZZINI ricondotti a GLS - CASTEL MAGGIORE", () => {
    const att = { DER1: -5939.55, DER2: -3043.3, DLO2: -6081.3, DLO4: -151.6, DLO5: -7386.99, DVN1: -1697.34, "GLS - CASTEL MAGGIORE": -363.9, SEDE: -15074.82 };
    expect(Object.fromEntries(e.stazioni.map((s) => [s, totaleStation(e, s)]))).toEqual(att);
    expect(e.nonMappati).toEqual([]);
    expect(e.ricondotti.map((r) => [r.codice, r.station, r.n])).toEqual([["972381776", "VALERIO", 20], ["310848320", "VIZZINI", 19]]);
  });

  it.skipIf(!hasOpenpyxl)("Excel identico all'atteso cella per cella (valori, formule, formati)", async () => {
    const out = tmp(e.nomeFile);
    fs.writeFileSync(out, Buffer.from(await excelTelepass(e).xlsx.writeBuffer()));
    const c = confronta(out, atteso("10_Telepass_Ottobre_2026.xlsx"));
    expect(c.differenze, c.output).toBe(0);
  }, 300_000);
});

describe.skipIf(!hasKit)("Telepass ottobre 2026 — regola d'oro DLO4 (pagamento con targa)", () => {
  let e: EsitoTelepass;
  beforeAll(async () => {
    const mappa = leggiMappaTelepass(await grids(esempio("TBusiness_carica_veicoli.xlsx")));
    e = elaboraTelepass(csv(esempio("_lista_transazioni_03-11-2026_15-47.csv")), new Map(mappa.map((d) => [d.codice, d.station])));
  }, 120_000);

  it("le 167 righe pagate con targa vanno tutte a DLO4 con importo −7,50", () => {
    const iPag = e.intestazione.indexOf("Pagamento");
    const targa = e.righe.filter((r) => r[iPag] === "Targa");
    expect(targa.length).toBe(167);
    expect(new Set(targa.map((r) => r[e.iStation]))).toEqual(new Set(["DLO4"]));
    expect(new Set(targa.map((r) => r[e.iImporto]))).toEqual(new Set([-7.5]));
    expect(e.areaC).toMatchObject({ n: 167, importiCorretti: 144, daAltreStation: 164, delta: -432 });
  });

  it("totali ricalcolati (−4,50 → −7,50 e spostamento a DLO4)", () => {
    expect(e.perStation).toEqual({ DER1: -5408.55, DER2: -3043.3, DLO2: -5922.3, DLO4: -1390.6, DLO5: -7320.99, DVN1: -1683.84, "GLS - CASTEL MAGGIORE": -363.9, SEDE: -15037.32 });
    expect(e.totale).toBe(-40170.8);
    expect(e.anomalie.find((a) => a.tipo.startsWith("Pagamento con targa"))?.n).toBe(167);
    expect(e.ricondotti.map((r) => r.n)).toEqual([20, 19]);
  });
});
