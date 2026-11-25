import { describe, it, expect } from "vitest";
import type { Cell, SheetGrid } from "@/domain/presenze/grid";
import { giornoQ8, numeroQ8, transazioniDaEsito } from "@/domain/carburante/q8Righe";
import { elaboraQ8 } from "@/domain/telepass/q8";
import type { Carta } from "@/domain/telepass/anagrafiche";

// dati inventati: PAN, codici e indirizzi di prova
const HDR = ["PAN Carta", "Data", "Ora", "Prod.", "STATION", "Targa", "Identificativo", "Km", "Impianto", "Indirizzo", "Città", "Volume", "Imp. Scontato", "Imp. Scontato no IVA"];
type Riga = Partial<Record<(typeof HDR)[number], Cell>>;
const riga = (x: Riga): Cell[] => HDR.map((h) => (h in x ? x[h]! : null));
const base: Riga = {
  "PAN Carta": "7000000000000000001", Data: new Date("2026-08-31T19:33:32Z"), Ora: new Date("2026-08-31T19:33:32Z"), "Prod.": "GASOLIO", STATION: "DER2",
  Targa: " amz 726 ", Identificativo: "AMZ726", Km: 5324, Impianto: 1365, Indirizzo: " VIA DI PROVA 1 ", "Città": "CESENA", Volume: 36.76, "Imp. Scontato": 79, "Imp. Scontato no IVA": 64.75409836,
};
const esito = (righe: Cell[][], intestazione = HDR) => ({ anno: 2026, mese: 8, intestazione, righe });

describe("transazioni Q8 riga per riga", () => {
  it("date come Date UTC: giorno e ora italiani dai componenti UTC, testi puliti, importi a 2 decimali", () => {
    const [t, ...resto] = transazioniDaEsito(esito([riga(base)]));
    expect(resto).toEqual([]);
    expect(t).toEqual({
      chiave: "7000000000000000001|2026-08-31|19:33:32|36.76|79.00", mese: "2026-08", giorno: "2026-08-31", ora: "19:33:32", station: "DER2",
      pan: "7000000000000000001", identificativo: "AMZ726", targaQ8: "AMZ726", prodotto: "GASOLIO", litri: 36.76, importo: 79, importoNoIva: 64.75,
      impianto: "1365", indirizzo: "VIA DI PROVA 1", citta: "CESENA", km: 5324,
    });
  });

  it("Ora come sola ora (Date del 1899) e millisecondi arrotondati", () => {
    const [t] = transazioniDaEsito(esito([riga({ ...base, Data: new Date("2026-08-05T00:00:00Z"), Ora: new Date("1899-12-30T07:05:08.999Z") })]));
    expect([t.giorno, t.ora]).toEqual(["2026-08-05", "07:05:09"]);
  });

  it("numeri seriali Excel: giorni dal 1899-12-30, la frazione è l'ora", () => {
    // 46265 = 2026-08-31; 0.75 = 18:00
    const [a, b] = transazioniDaEsito(esito([riga({ ...base, Data: 46265.75, Ora: null }), riga({ ...base, Data: 46265, Ora: 0.5 + 30 / 86400 })]));
    expect([a.giorno, a.ora]).toEqual(["2026-08-31", "18:00:00"]);
    expect([b.giorno, b.ora]).toEqual(["2026-08-31", "12:00:30"]);
  });

  it("stringhe gg/mm/aaaa e hh:mm[:ss], numeri con la virgola", () => {
    const [a, b, c] = transazioniDaEsito(esito([
      riga({ ...base, Data: "05/08/2026", Ora: "7:30", Volume: "40,5", "Imp. Scontato": "1.234,567", "Imp. Scontato no IVA": "10,005", Km: "12.345,0" }),
      riga({ ...base, Data: "06/08/2026 21:15:09", Ora: "non valida" }),
      riga({ ...base, Data: "07/08/2026", Ora: null }),
    ]));
    expect(a).toMatchObject({ giorno: "2026-08-05", ora: "07:30:00", litri: 40.5, importo: 1234.57, km: 12345 });
    expect([b.giorno, b.ora]).toEqual(["2026-08-06", "21:15:09"]);
    expect([c.giorno, c.ora]).toEqual(["2026-08-07", "00:00:00"]);
  });

  it("righe uguali nello stesso file: chiave con #2, #3", () => {
    const t = transazioniDaEsito(esito([riga(base), riga(base), riga({ ...base, Volume: 10 }), riga(base)]));
    expect(t.map((x) => x.chiave)).toEqual([
      "7000000000000000001|2026-08-31|19:33:32|36.76|79.00",
      "7000000000000000001|2026-08-31|19:33:32|36.76|79.00#2",
      "7000000000000000001|2026-08-31|19:33:32|10.00|79.00",
      "7000000000000000001|2026-08-31|19:33:32|36.76|79.00#3",
    ]);
  });

  it("scarta le righe senza data valida o senza litri; km non validi e testi vuoti diventano null", () => {
    const t = transazioniDaEsito(esito([
      riga({ ...base, Data: null }), riga({ ...base, Data: "31/02/2026" }), riga({ ...base, Data: "boh" }), riga({ ...base, Volume: 0 }),
      riga({ ...base, Volume: -5 }), riga({ ...base, Volume: null }), riga({ ...base, Volume: "x" }), [],
      riga({ ...base, Km: 0, Targa: "  ", Indirizzo: "", "Città": null, Impianto: null, STATION: null, "Imp. Scontato": null }),
    ]));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ km: null, targaQ8: null, indirizzo: null, citta: null, impianto: null, station: null, importo: 0 });
  });

  it("intestazione con Veicolo al posto di STATION; colonne obbligatorie", () => {
    const hdr = HDR.map((h) => (h === "STATION" ? "Veicolo" : h));
    const [t] = transazioniDaEsito(esito([riga({ ...base, STATION: "GLS" })], hdr));
    expect(t.station).toBe("GLS");
    expect(() => transazioniDaEsito(esito([riga(base)], HDR.map((h) => (h === "Volume" ? "Litri" : h))))).toThrow(/Volume/);
  });

  it("dall'elaborazione Q8 vera e propria (Veicolo → STATION dal censimento)", () => {
    const hdr = ["Cod. Main", "PAN Carta", "N. ticket", "Data", "Ora", "Prod.", "Veicolo", "Codice autista", "Targa", "Identificativo", "Km", "Impianto", "Indirizzo", "Città", "Volume", "Imp. Scontato", "Imp. Scontato no IVA"];
    const r = (pan: string, id: string, litri: number): Cell[] => ["1", pan, "001", new Date("2026-10-05T08:10:00Z"), new Date("2026-10-05T08:10:00Z"), "GASOLIO", "0000", null, id, id, 100, "42", "VIA X", "RIMINI", litri, litri * 2, litri * 2 / 1.22];
    const g: SheetGrid = { name: "Transazioni", rows: [[], hdr, r("P1", "AMZ001", 30), r("P8", "LOR001", 4)], formulas: new Set(), notes: new Map() };
    const cens: Carta[] = [{ pan: "P1", numeroCarta: null, identificativo: "AMZ001", targa: null, bloccata: "NO", dataBlocco: null, centroCosto: null, appalto: "AMZ", ds: "DER2", ordine: 1 }];
    const t = transazioniDaEsito(elaboraQ8([g], cens));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ mese: "2026-10", giorno: "2026-10-05", ora: "08:10:00", station: "DER2", pan: "P1", litri: 30, importo: 60, importoNoIva: 49.18, impianto: "42" });
  });

  it("utilità: giorno di una cella Data e numeri", () => {
    expect(giornoQ8(new Date("2026-10-31T23:59:59Z"))).toBe("2026-10-31");
    expect(giornoQ8(46265)).toBe("2026-08-31");
    expect(giornoQ8("2026-09-01")).toBe("2026-09-01");
    expect(giornoQ8(0.5)).toBeNull();
    expect(numeroQ8(" 36,76 ")).toBe(36.76);
    expect(numeroQ8("1.234,5")).toBe(1234.5);
    expect(numeroQ8(true)).toBeNull();
  });
});
