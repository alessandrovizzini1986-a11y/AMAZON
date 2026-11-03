import { describe, it, expect } from "vitest";
import type { Cell, SheetGrid } from "@/domain/presenze/grid";
import { numIt, settimaneDelMese, weeknumExcel, mesePrevalente } from "@/domain/telepass/comune";
import { confrontaImport, leggiMappaTelepass, type Carta } from "@/domain/telepass/anagrafiche";
import { elaboraTelepass, isTelepassCsv } from "@/domain/telepass/telepass";
import { elaboraQ8, isQ8 } from "@/domain/telepass/q8";

const D = (iso: string) => new Date(iso + "T00:00:00Z");
const grid = (name: string, rows: Cell[][]): SheetGrid => ({ name, rows, formulas: new Set(), notes: new Map() });

describe("utilità", () => {
  it("WEEKNUM di Excel (sistema 1, inizio domenica)", () => {
    expect(weeknumExcel(D("2026-01-01"))).toBe(1);
    expect(weeknumExcel(D("2026-01-03"))).toBe(1); // sabato
    expect(weeknumExcel(D("2026-01-04"))).toBe(2); // domenica
    expect(weeknumExcel(D("2026-10-31"))).toBe(44);
    expect(settimaneDelMese(2026, 10)).toEqual([40, 41, 42, 43, 44]);
  });
  it("numeri all'italiana come num_it", () => {
    expect(numIt("-2,40")).toBe(-2.4);
    expect(numIt("1.234,50")).toBe(1234.5);
    expect(numIt("1")).toBe(1);
    expect(numIt("")).toBeNull();
    expect(numIt("abc")).toBe("abc");
  });
  it("mese prevalente: a pari merito vince il primo", () => {
    expect(mesePrevalente([D("2026-10-31"), D("2026-11-01"), D("2026-10-02")])).toEqual({ anno: 2026, mese: 10 });
  });
});

describe("anagrafiche", () => {
  it("mappa Telepass per intestazione, codici numerici o testo, ultima riga vince", () => {
    const g = grid("TELEPASS FINALE", [["TELEPASS", "STATION", "AREA C", "PROGETTO ", "CHECK"], [972299655, "DER1", null, "AMAZON", "Attivo"], ["111.0", "DLO2", "AB123CD", "AMAZON", "Bloccato"], [972299655, "DER2", null, "AMAZON", "Attivo"]]);
    expect(leggiMappaTelepass([g])).toEqual([
      { codice: "972299655", station: "DER2", targa: null, progetto: "AMAZON", check: "Attivo" },
      { codice: "111", station: "DLO2", targa: "AB123CD", progetto: "AMAZON", check: "Bloccato" },
    ]);
  });
  it("riepilogo import: nuovi, aggiornati, invariati, spariti", () => {
    const att = [{ k: "1", st: "A" }, { k: "2", st: "B" }, { k: "3", st: "C" }];
    const r = confrontaImport(att, [{ k: "1", st: "A" }, { k: "2", st: "X" }, { k: "4", st: "D" }], "k", ["st"]);
    expect([r.nuovi, r.aggiornati, r.invariati, r.spariti]).toEqual([1, 1, 1, 1]);
    expect(r.dettaglio.find((d) => d.chiave === "2")!.cambi).toEqual(["st: B → X"]);
  });
});

describe("Telepass", () => {
  const hdr = "ID Transazione;ID Codificato;Movimento;Data;Orario;Importo;Stato;Codice dispositivo;CDC veicolo".split(";");
  const riga = (d: string, imp: string, disp: string) => ["x", "y", "Pedaggio", d, "21:38:29", imp, "Da fatturare", disp, ""];
  it("riconosce il CSV dalla prima riga (con BOM)", () => {
    expect(isTelepassCsv("﻿ID Transazione;ID Codificato;Movimento;…")).toBe(true);
    expect(isTelepassCsv("Data,Nome")).toBe(false);
  });
  it("STATION dalla mappa; non standard → GLS - CASTEL MAGGIORE; mancante → NON MAPPATO", () => {
    const e = elaboraTelepass([hdr, riga("01/10/2026", "-2,40", "1"), riga("02/10/2026", "-1,00", "2"), riga("03/10/2026", "-3,00", "9"), riga("01/11/2026", "-1,00", "1")], new Map([["1", "DER1"], ["2", "VALERIO"]]));
    expect(e.righe.map((r) => r[e.iStation])).toEqual(["DER1", "GLS - CASTEL MAGGIORE", "NON MAPPATO", "DER1"]);
    expect(e.righe[0][e.iOra]).toBeCloseTo((21 * 3600 + 38 * 60 + 29) / 86400);
    expect(e.righe[0][e.iImporto]).toBe(-2.4);
    expect(e.nonMappati).toEqual([{ codice: "9", n: 1 }]);
    expect(e.ricondotti.map((r) => [r.codice, r.station])).toEqual([["2", "VALERIO"]]);
    expect(e.fuoriMese).toBe(1);
    expect(e.intestazione[6]).toBe("STATION");
    expect(e.intestazione.at(-1)).toBe("WEEK");
  });
});

describe("Q8", () => {
  const hdr = ["Cod. Main", "PAN Carta", "N. ticket", "Data", "Ora", "Veicolo", "Codice autista", "Identificativo", "Imp. Scontato", "Imp. Scontato no IVA"];
  const r = (pan: string, id: string, v: number) => ["1", pan, "001", new Date("2026-10-05T08:00:00Z"), new Date("2026-10-05T08:00:00Z"), "0000", null, id, v * 1.22, v] as Cell[];
  const cens: Carta[] = [
    { pan: "P1", numeroCarta: null, identificativo: "AMZ001", targa: null, bloccata: "NO", dataBlocco: null, centroCosto: null, appalto: "AMZ", ds: "DER1", ordine: 1 },
    { pan: "P2", numeroCarta: null, identificativo: "AMZ002", targa: null, bloccata: "NO", dataBlocco: null, centroCosto: null, appalto: "AMZ", ds: "Da verificare", ordine: 2 },
  ];
  const g = grid("Transazioni Q8 Flotte", [[], hdr, r("P1", "AMZ001", 10), r("PX", "amz001", 5), r("P2", "AMZ002", 7), r("P9", "GLS100", 3), r("P8", "LOR001", 4)]);
  it("intestazione in riga 2, tiene solo AMZ/GLS, PAN → DS, poi Identificativo, poi NON CENSITA", () => {
    expect(isQ8([g])).toBe(true);
    const e = elaboraQ8([g], cens);
    expect(e.righe.map((x) => x[e.iStation])).toEqual(["DER1", "DER1", "NON CENSITA", "NON CENSITA"]);
    expect(e.scartate).toEqual([{ prefisso: "LOR", n: 1 }]);
    expect(e.perIdentificativo.map((x) => [x.pan, x.identificativo, x.station])).toEqual([["PX", "AMZ001", "DER1"]]);
    expect(e.nonCensite.map((x) => x.pan)).toEqual(["P2", "P9"]);
    expect(e.intestazione.slice(-2)).toEqual(["AMZ", "WEEK"]);
    expect(e.perStation).toEqual({ DER1: 15, "NON CENSITA": 10 });
  });
});
