import { describe, it, expect } from "vitest";
import {
  parseCentri, applyFiltri, facetOptions, pruneFiltri, toggleValue, countCentri,
  filtriToParams, filtriFromParams, DEFAULT_FILTRI, EMPTY_FILTRI, type Centro, type Filtri,
} from "@/domain/officine";

const header = ["", "", "Ragione Sociale", "Regione", "Località", "Provincia", "Indirizzo", "Officina", "Carrozzeria",
  "Rete Assistenza ufficiale", "Assistenza su tutti i brand", "Transit Center (Ford)"];
// stessa forma del file Ayvens: pannello filtri sopra, tabella da riga 19, spazi in coda
const sheet: unknown[][] = [
  ["", "", "Lista centri Ayvens Van"],
  ["", "", "Ragione Sociale ", "", "", "", "", "Officina", "   Si", true],
  header,
  ["", "", "CARROZZERIA SUISSE S.R.L. ", "Abruzzo", "Lanciano", "Chieti", "Zona Industriale 52", "Si", "Si", "Citroen", "No", "No"],
  ["", "", "CARROZZERIA SUISSE S.R.L.", "Abruzzo", "Lanciano", "Chieti", "Zona Industriale 52", "Si", "Si", "Fiat", "No", "No"],
  ["", "", "AUTO NORD", "Lombardia", "Milano", "Milano", "Via Roma 1   ", "Si", "No", "Ford", "Si", "Si"],
  ["", "", "SOLO CARROZZERIA", "Lombardia", "Brescia", "Brescia", "Via Po 2", "No", "Si", "Nessuno", "No", "No"],
  ["", "", "EMILIA VAN", "Emilia Romagna", "Bologna", "Bologna", "Via Emilia 3", "Si", "No", "Iveco", "Si", "No"],
  ["", "", null],
];

describe("lettura file Ayvens", () => {
  const rows = parseCentri(sheet);
  it("trova l'intestazione della tabella anche sotto il pannello filtri", () => {
    expect(rows).toHaveLength(5);
  });
  it("ripulisce gli spazi e converte Si/No", () => {
    expect(rows[0]).toEqual({
      ragioneSociale: "CARROZZERIA SUISSE S.R.L.", regione: "Abruzzo", localita: "Lanciano", provincia: "Chieti",
      indirizzo: "Zona Industriale 52", officina: true, carrozzeria: true, rete: "Citroen", tuttiBrand: false, transit: false,
    });
    expect(rows[2].indirizzo).toBe("Via Roma 1");
  });
  it("rifiuta un file senza le colonne attese", () => {
    expect(() => parseCentri([["Targa", "Stato"]])).toThrow(/Ragione Sociale/);
    expect(() => parseCentri([["Ragione Sociale", "Regione", "Provincia"]])).toThrow(/Località/);
  });
});

describe("filtri come nell'Excel", () => {
  const rows = parseCentri(sheet);
  const f = (over: Partial<Filtri>): Filtri => ({ ...EMPTY_FILTRI, ...over });

  it("di default mostra solo le officine (casella Officina spuntata)", () => {
    expect(applyFiltri(rows, DEFAULT_FILTRI).map((c) => c.ragioneSociale)).not.toContain("SOLO CARROZZERIA");
    expect(applyFiltri(rows, EMPTY_FILTRI)).toHaveLength(5);
  });

  it("multi-selezione: più regioni in OR, filtri diversi in AND", () => {
    expect(applyFiltri(rows, f({ regione: ["Lombardia", "Abruzzo"] }))).toHaveLength(4);
    expect(applyFiltri(rows, f({ regione: ["Lombardia"], carrozzeria: true })).map((c) => c.ragioneSociale)).toEqual(["SOLO CARROZZERIA"]);
    expect(applyFiltri(rows, f({ rete: ["ford"] }))).toHaveLength(1); // maiuscole indifferenti
  });

  it("caselle Si: tutti i brand e Transit Center", () => {
    expect(applyFiltri(rows, f({ tuttiBrand: true })).map((c) => c.ragioneSociale)).toEqual(["EMILIA VAN", "AUTO NORD"]);
    expect(applyFiltri(rows, f({ transit: true })).map((c) => c.ragioneSociale)).toEqual(["AUTO NORD"]);
  });

  it("ordina come l'Excel: regione, provincia, località, ragione sociale", () => {
    expect(applyFiltri(rows, EMPTY_FILTRI).map((c) => c.regione)).toEqual(["Abruzzo", "Abruzzo", "Emilia Romagna", "Lombardia", "Lombardia"]);
  });

  it("cascata: ogni tendina mostra i valori compatibili con gli ALTRI filtri, con i conteggi", () => {
    const opts = facetOptions(rows, f({ regione: ["Lombardia"] }));
    expect(opts.regione.map((o) => o.value)).toEqual(["Abruzzo", "Emilia Romagna", "Lombardia"]); // si può aggiungere un'altra regione
    expect(opts.provincia).toEqual([{ value: "Brescia", count: 1 }, { value: "Milano", count: 1 }]);
    expect(facetOptions(rows, f({ carrozzeria: true })).rete.map((o) => o.value)).toEqual(["Citroen", "Fiat", "Nessuno"]);
  });

  it("toglie le scelte non più compatibili (come la macro)", () => {
    const pruned = pruneFiltri(rows, f({ regione: ["Lombardia"], provincia: ["Milano", "Chieti"] }));
    expect(pruned.provincia).toEqual(["Milano"]);
  });

  it("toggle della tendina aggiunge e toglie", () => {
    expect(toggleValue(["Lazio"], "Veneto")).toEqual(["Lazio", "Veneto"]);
    expect(toggleValue(["Lazio", "Veneto"], "lazio")).toEqual(["Veneto"]);
  });

  it("conta i centri unici (una riga per marchio)", () => {
    expect(countCentri(rows)).toBe(4);
  });

  it("filtri ↔ URL, solo le differenze dai default", () => {
    const fl: Filtri = { ...DEFAULT_FILTRI, regione: ["Emilia Romagna", "Lazio"], officina: false, transit: true };
    const p = filtriToParams(fl);
    expect(p.toString()).toBe("regione=Emilia+Romagna&regione=Lazio&officina=0&transit=1");
    expect(filtriFromParams(p)).toEqual(fl);
    expect(filtriToParams(DEFAULT_FILTRI).toString()).toBe("");
  });
});

describe("file vero di Ayvens (se presente)", () => {
  it("ha la forma attesa", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    const file = process.env.AYVENS_CENTRI_FILE;
    if (!file || !existsSync(file)) return;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(readFileSync(file) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Lista Centri")!;
    const sheet: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => sheet.push((row.values as unknown[]).slice(1)));
    const rows: Centro[] = parseCentri(sheet);
    expect(rows).toHaveLength(930);
    expect(countCentri(rows)).toBe(745);
    expect(applyFiltri(rows, DEFAULT_FILTRI)).toHaveLength(905);
    expect(rows.every((c) => c.ragioneSociale === c.ragioneSociale.trim())).toBe(true);
  });
});
