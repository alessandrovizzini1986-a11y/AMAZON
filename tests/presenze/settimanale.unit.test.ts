import { describe, it, expect } from "vitest";
import type { Cell, SheetGrid } from "@/domain/presenze/grid";
import { findTrackingSheet } from "@/domain/presenze/tracking";
import { parseFlexRows } from "@/domain/presenze/flex";
import { normName, okId } from "@/domain/presenze/regole";
import { controlloSettimanale, maxConsecutivi, righePerDriver, type TrackingInput } from "@/domain/presenze/controlloSettimanale";

const grid = (name: string, rows: Cell[][], formulas: string[] = [], notes: [string, string][] = []): SheetGrid => ({ name, rows, formulas: new Set(formulas), notes: new Map(notes) });
const D = (iso: string) => new Date(iso + "T00:00:00Z");

describe("normalizzazione", () => {
  it("nomi: ordine, maiuscole, accenti e apostrofi indifferenti", () => {
    expect(normName("TONTOROIU NICUSOR")).toBe(normName("nicusor Tontoroiu"));
    expect(normName("D'Andrea Niccolò")).toBe(normName("dandrea niccolo"));
  });
  it("ID Amazon non validi", () => {
    for (const v of ["0", "-", "NA", "x", "", null]) expect(okId(v)).toBe(false);
    expect(okId("A1VSFGNH51HV4L")).toBe(true);
  });
});

describe("tracking: colonne giorno", () => {
  it("interi con sconfinamento: 28-30 = mese prima, dopo il 31 mese dopo, stop a Totale", () => {
    const hdr: Cell[] = ["Tipo contratto", "Lavoratore", "Driver ID", "Tipo", 29, 30, 1, 2, 31, 1, "Totale", 8, 15];
    const ts = findTrackingSheet([grid("10.26", [hdr])], 2026, 10);
    expect(ts.dayCols.map((d) => d.date)).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-31", "2026-11-01"]);
  });
  it("date vere con colonne totale intercalate: si saltano", () => {
    const hdr: Cell[] = ["Tipo", D("2026-10-05"), D("2026-10-06"), "totale", D("2026-10-07")];
    const ts = findTrackingSheet([grid("Ottobre", [hdr])], 2026, 10);
    expect(ts.dayCols.map((d) => d.date)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
  });
  it("sceglie il foglio dal contenuto, non dal nome", () => {
    const set = grid("08.26", [["Tipo", D("2026-09-01"), D("2026-09-02")]]);
    const ago = grid("09.26", [["Tipo", D("2026-08-31"), D("2026-09-01")]]);
    expect(findTrackingSheet([ago, set], 2026, 9).grid.name).toBe("08.26");
  });
  it("errore chiaro se manca la riga Tipo", () => {
    expect(() => findTrackingSheet([grid("x", [["a", "b"]])], 2026, 10)).toThrow(/Tipo/);
  });
});

describe("CSV Amazon", () => {
  const hdr = ["Data", "Nome dell’addetto alla consegna", "ID addetto alle consegne", "Pacchi consegnati", "Pacchi spediti"];
  it("station dal nome file, ID in maiuscolo, righe senza ID scartate", () => {
    const f = parseFlexRows([hdr, ["2026-10-26", "Mario Rossi", "a1b2", "176", "180"], ["2026-10-26", "Senza Id", "", "5", "5"]], "DER1_26_10_26.csv");
    expect(f.rows).toEqual([{ station: "DER1", data: "2026-10-26", nome: "Mario Rossi", driverId: "A1B2", pacchi: 176, spediti: 180 }]);
  });
  it("CSV unito con colonna Station", () => {
    const f = parseFlexRows([["Station", ...hdr], ["DLO2", "2026-10-01", "X Y", "ID1", "50", "50"]], "FLEX_TUTTI.csv");
    expect(f.stations).toEqual(["DLO2"]);
  });
  it("rifiuta file non Amazon o senza station", () => {
    expect(() => parseFlexRows([["a", "b"]], "DER1_1.csv")).toThrow(/intestazione/);
    expect(() => parseFlexRows([hdr], "export.csv")).toThrow(/station/);
  });
});

describe("controllo settimanale: categorie per gli Ops", () => {
  // tracking minimo: 2 driver SIC + 1 STD, giorni 5-7 ottobre
  const hdr: Cell[] = [null, "Tipo Contratto", "Lavoratore", "Driver ID", "Codice fiscale", "Codice Matricola", "Tipo", D("2026-10-05"), D("2026-10-06"), D("2026-10-07")];
  const blocco = (nome: string, id: string, ore: number[], trasf: number[], riposo: (string | null)[] = [null, null, null], contr = "CTI") => [
    [null, contr, nome, id, "", "", "Standard", ...ore],
    [null, null, null, null, null, null, "Indennità Trasferta", ...trasf],
    [null, null, null, null, null, null, "RIPOSO", ...riposo],
  ] as Cell[][];
  // Bianchi: il 5 la trasferta è a formula (3 h → 0, Amazon in rotta → -1),
  // il 6 è 0 scritto a mano senza riga Amazon (→ H)
  const sic = grid("10.26", [hdr,
    ...blocco("Rossi Mario", "ID1", [8, 8, 8], [1, 1, 1], [null, "MEZZI", null]),
    ...blocco("Bianchi Luca", "ID2", [3, 6, 0], [0, 0, 0]),
    ...blocco("Verdi Anna", "ID3", [8, 8, 8], [1, 1, 1], [null, null, null], "DISPATCHER"),
  ], ["5:7"]);
  const std = grid("10.26", [hdr, ...blocco("Neri Paolo", "", [0, 0, 0], [0, 0, 0])]);
  const trk: TrackingInput[] = [
    { station: "DLO4", tipo: "SIC", fileName: "SIC_DLO4.xlsx", sheets: [sic] },
    { station: "DLO4", tipo: "STD", fileName: "STD_DLO4.xlsx", sheets: [std] },
  ];
  const f = (station: "DLO4" | "DLO2", data: string, nome: string, id: string, pacchi: number) => ({ station, data, nome, driverId: id, pacchi, spediti: pacchi });
  const flex = [
    f("DLO4", "2026-10-05", "Mario Rossi", "ID1", 150), // ok
    // 06: Rossi senza rotta ma MEZZI → nessun alert; 07: Rossi +1
    f("DLO4", "2026-10-05", "Luca Bianchi", "ID2", 120), // 3 h a formula con rotta → -1 (D3)
    f("DLO4", "2026-10-06", "Paolo Neri", "ZZ9", 90), // nome uguale, ID nuovo, tracking 0 h → -1 (aggancio per nome)
    f("DLO4", "2026-10-07", "Sconosciuto Tizio", "QQ1", 100), // A
    f("DLO2", "2026-10-07", "Sconosciuto Tizio", "QQ1", 20),
    f("DLO4", "2026-10-06", "Altro Nome", "PP1", 3), // sotto soglia: niente A
  ];
  const e = controlloSettimanale(trk, flex, { station: "DLO4", da: "2026-10-05", a: "2026-10-07", giustificativi: ["MEZZI"], dispatcher: [] });
  const cat = (nome: string, d: string) => e.dettaglio.find((r) => r.driver === nome && r.data === d)?.categoria;

  it("ok, +1, giustificativo MEZZI, dispatcher escluso", () => {
    expect(cat("Rossi Mario", "2026-10-05")).toBe("ok");
    expect(cat("Rossi Mario", "2026-10-06")).toBe("");
    expect(cat("Rossi Mario", "2026-10-07")).toBe("+1");
    expect(["2026-10-05", "2026-10-06", "2026-10-07"].map((d) => cat("Verdi Anna", d))).toEqual(["", "", ""]);
  });
  it("trasferta 0 scritta a mano con rotta: voluta, nessun alert", () => {
    const e3 = controlloSettimanale(trk.map((t) => t.tipo === "SIC" ? { ...t, sheets: [{ ...sic, formulas: new Set<string>() }] } : t), flex, { station: "DLO4", da: "2026-10-05", a: "2026-10-07" });
    const r = e3.dettaglio.find((x) => x.driver === "Bianchi Luca" && x.data === "2026-10-05")!;
    expect([r.esitoBase, r.categoria]).toEqual(["OK", ""]);
    expect(r.nota).toMatch(/voluta/);
  });
  it("-1 e H", () => {
    expect(cat("Bianchi Luca", "2026-10-05")).toBe("-1");
    expect(cat("Bianchi Luca", "2026-10-06")).toBe("H");
    expect(cat("Neri Paolo", "2026-10-06")).toBe("-1");
  });
  it("A con nota sull'altra station, niente A sotto soglia", () => {
    expect(e.nonInTracking.filter((n) => n.categoria === "A").map((n) => [n.driver, n.nota])).toEqual([["Sconosciuto Tizio", "presente in Amazon anche su: DLO2 → probabile prestito"]]);
  });
  it("righe per driver con giorni da verificare", () => {
    const r = righePerDriver(e).find((x) => x.driver === "Bianchi Luca")!;
    expect(r.daVerificare).toBe("5(-1), 6(H)");
  });
  it("A chiuso se il driver è nel tracking di un'altra station quel giorno", () => {
    const dlo2 = grid("10.26", [hdr, ...blocco("Tizio Sconosciuto", "QQ1", [0, 0, 7], [0, 0, 1])]);
    const e2 = controlloSettimanale(trk, flex, { station: "DLO4", da: "2026-10-05", a: "2026-10-07", giustificativi: [], dispatcher: [] }, [{ station: "DLO2", tipo: "SIC", fileName: "x", sheets: [dlo2] }]);
    expect(e2.nonInTracking.find((n) => n.driverId === "QQ1")).toMatchObject({ categoria: "", nota: expect.stringContaining("Prestito da DLO2") });
  });
});

describe("giorni consecutivi", () => {
  it("massima sequenza", () => {
    expect(maxConsecutivi(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05"])).toEqual({ n: 3, dal: "2026-10-01", al: "2026-10-03" });
  });
});
