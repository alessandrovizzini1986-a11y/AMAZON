import { describe, it, expect } from "vitest";
import { fondiRichieste, leggiContratto, ripartoAtteso, tettoAccordo, verificaOre, type OreGiorno, type Persona, type Richiesta } from "@/domain/presenze/verifica";
import { addDays } from "@/domain/presenze/grid";

const g = (std = 0, x: Partial<OreGiorno> = {}): OreGiorno => ({ std, sup: 0, acc: 0, str: 0, ass: 0, ...x });
/** settimana 02–08/11/2026 (lunedì–domenica), tutta coperta */
const LUN = "2026-11-02";
const coperti = (k = "DER1|SIC") => new Map([[k, new Set(Array.from({ length: 30 }, (_, i) => addDays("2026-10-26", i)))]]);
const persona = (contratto: string, giorni: (OreGiorno | null)[], da = LUN, pop: "SIC" | "STD" = "SIC"): Persona =>
  ({ station: "DER1", pop, nome: "Rossi Mario", cf: "CF1", driverId: "A1", contratto, giorni: new Map(giorni.flatMap((o, i) => (o ? [[addDays(da, i), o] as [string, OreGiorno]] : []))) });
const run = (p: Persona, k?: string) => verificaOre([p], coperti(k), { mese: "2026-11", finoA: "2026-11-22" });

describe("regole delle ore: contratto, tetto, riparto", () => {
  it("tetto dell'Accordo per data", () => {
    expect([tettoAccordo("2026-05-31"), tettoAccordo("2026-06-01"), tettoAccordo("2027-06-30"), tettoAccordo("2027-07-01")]).toEqual([43, 42, 42, 41]);
  });
  it("ore di contratto dal testo del tracking", () => {
    expect(leggiContratto("CTI FT")).toEqual({ tipo: "FT", ore: 39 });
    expect(leggiContratto("CTI PT 32H")).toEqual({ tipo: "PT", ore: 32 });
    expect(leggiContratto("CTI PT OR 32,5H")).toEqual({ tipo: "PT", ore: 32.5 });
    expect(leggiContratto("STD PT 60%")).toEqual({ tipo: "PT", ore: 23.4 });
    expect(leggiContratto("CTD PT 60")).toEqual({ tipo: "PT", ore: 23.4 });
    expect(leggiContratto("CTI PT")).toEqual({ tipo: "PT", ore: null });
    expect(leggiContratto("MOG 35%").tipo).toBe("MOG");
    expect(leggiContratto("DISPATCHER- PT 30h").tipo).toBe("DISPATCHER");
  });
  it("full time: 39 Standard, poi Accordo fino al tetto, poi Straordinario", () => {
    const ft = leggiContratto("CTI FT");
    expect(ripartoAtteso(40, 0, ft, 42)).toEqual({ std: 39, sup: 0, acc: 1, str: 0 });
    expect(ripartoAtteso(48, 0, ft, 42)).toEqual({ std: 39, sup: 0, acc: 3, str: 6 });
    expect(ripartoAtteso(32, 8, ft, 42)).toEqual({ std: 31, sup: 0, acc: 1, str: 0 }); // un giorno di ferie conta verso le 39
  });
  it("part time: Standard fino al contratto, Supplementare fino a 39, poi Accordo e Straordinario", () => {
    expect(ripartoAtteso(48, 0, leggiContratto("CTI PT 24H"), 42)).toEqual({ std: 24, sup: 15, acc: 3, str: 6 });
  });
});

describe("verifica delle settimane", () => {
  it("settimana giusta: nessuna richiesta", () => {
    const e = run(persona("CTI FT", [g(8, { acc: 0.5 }), g(8), g(8), g(8), g(7, { acc: 0.5 }), null, null]));
    expect(e.richieste).toEqual([]);
    expect(e.settimane.find((s) => s.lunedi === LUN)).toMatchObject({ std: 39, acc: 1, tot: 40, giorniLavorati: 5, esito: "ok" });
  });
  it("straordinario prima del tetto: 48 ore con Accordo 1 e Straordinario 8", () => {
    const e = run(persona("CTI FT", [g(8), g(8), g(8), g(8), g(7, { acc: 1 }), g(0, { str: 8 }), null]));
    expect(e.richieste.map((r) => r.tipo)).toEqual(["STR_PRIMA"]);
    expect(e.richieste[0].testo).toContain("Accordo 1 → 3; Straordinario 8 → 6");
    expect(e.richieste[0].chiave).toBe(`2026-11|DER1|SIC|CF1|STR_PRIMA|${LUN}`);
  });
  it("le assenze possono contare o no verso le 39 ore: si segnala solo se non torna in nessuno dei due modi", () => {
    // 4 giorni da 8 h + 8 h di ferie + 1 h di Accordo: torna contando le ferie
    expect(run(persona("CTI FT", [g(8), g(8), g(8), g(7, { acc: 1 }), g(0, { ass: 8 }), null, null])).richieste).toEqual([]);
    // 5 giorni lavorati (40 h) + un giorno di ferie: torna senza contare le ferie
    expect(run(persona("CTI FT", [g(8), g(8), g(8), g(8), g(7, { acc: 1 }), g(0, { ass: 8 }), null])).richieste).toEqual([]);
  });
  it("part time: un giorno in più è Supplementare; Standard oltre il contratto e Accordo sotto le 39 ore si segnalano", () => {
    expect(run(persona("CTI PT 24H", [g(8), g(8), g(8), g(0, { sup: 8 }), null, null, null])).richieste).toEqual([]);
    expect(run(persona("CTI PT 24H", [g(8), g(8), g(8), g(8), null, null, null])).richieste.map((r) => r.tipo)).toEqual(["STD_OLTRE"]);
    expect(run(persona("CTI PT 24H", [g(8, { acc: 1 }), g(8), g(8), null, null, null, null])).richieste.map((r) => r.tipo)).toEqual(["ACC_SOTTO"]);
  });
  it("Supplementare su un full time; dispatcher esclusi dal riparto", () => {
    expect(run(persona("CTI FT", [g(8), g(8), g(8), g(0, { sup: 8 }), null, null, null])).richieste.map((r) => r.tipo)).toEqual(["SUP"]);
    expect(run(persona("DISPATCHER", [g(8), g(8), g(8), g(8), g(8), g(0, { str: 8 }), null])).richieste).toEqual([]);
  });
  it("7 giorni di fila anche a cavallo del mese; 6 giorni + domenica è solo un elenco", () => {
    const sette = run(persona("CTI FT", Array.from({ length: 7 }, () => g(5)), "2026-10-29"));
    expect(sette.richieste.filter((r) => r.tipo === "7GG").map((r) => [r.rif, r.periodo])).toEqual([["2026-10-29", "29/10–04/11"]]);
    const sei = run(persona("CTI FT", [g(6), g(6), null, g(6), g(6), g(6), g(6)]));
    expect(sei.richieste.filter((r) => r.tipo === "7GG")).toEqual([]);
    expect(sei.seiDomenica).toEqual([{ station: "DER1", pop: "SIC", driver: "Rossi Mario", contratto: "CTI FT", domenica: "2026-11-08", riposo: "mer", ore: 36 }]);
  });
  it("settimana a cavallo senza il tracking del mese prima: non si controlla e lo dice", () => {
    const soloNov = new Map([["DER1|SIC", new Set(Array.from({ length: 30 }, (_, i) => addDays("2026-11-01", i)))]]);
    const e = verificaOre([persona("CTI FT", [g(8), g(8), g(8), g(8), g(8), g(0, { str: 8 }), null], "2026-10-26")], soloNov, { mese: "2026-11", finoA: "2026-11-22" });
    expect(e.richieste).toEqual([]);
    expect(e.nonVerificabili[0]).toContain("26/10–01/11");
  });
  it("Standard oltre 8h24 nel giorno", () => {
    expect(run(persona("CTI FT", [g(9), null, null, null, null, null, null])).richieste.map((r) => r.tipo)).toEqual(["STD_GIORNO"]);
  });
});

describe("le richieste tengono lo stato tra un controllo e l'altro", () => {
  const r = (chiave: string, testo = "t"): Richiesta => ({ chiave, mese: "2026-11", station: "DER1", pop: "SIC", driver: "X", tipo: "+1", rif: "2026-11-03", periodo: "03/11", testo });
  it("nuova = da creare; già OK resta; sparita = risolta; OK con dati cambiati si riapre", () => {
    const salvate = [
      { chiave: "2026-11|DER1|a", stato: "OK" as const, testo: "t" }, { chiave: "2026-11|DER1|b", stato: "RICHIESTA" as const, testo: "t" },
      { chiave: "2026-11|DER1|c", stato: "OK" as const, testo: "vecchio" }, { chiave: "2026-11|DER2|d", stato: "DA_FARE" as const, testo: "t" },
      { chiave: "2026-11|DER1|e", stato: "OK" as const, testo: "t" }, { chiave: "2026-11|DER1|f", stato: "RISOLTA" as const, testo: "t" },
    ];
    const f = fondiRichieste(salvate, [r("2026-11|DER1|a"), r("2026-11|DER1|c", "nuovo"), r("2026-11|DER1|n"), r("2026-11|DER1|f")], ["DER1"], "2026-11");
    expect(f.crea.map((x) => x.chiave)).toEqual(["2026-11|DER1|n"]);
    expect(f.aggiorna).toEqual([
      { chiave: "2026-11|DER1|c", stato: "DA_FARE", testo: "nuovo", riaperta: true },
      { chiave: "2026-11|DER1|f", stato: "DA_FARE", testo: "t", riaperta: true },
      { chiave: "2026-11|DER1|b", stato: "RISOLTA", testo: "t", riaperta: false },
    ]); // DER2 non è stata controllata: resta com'è; "e" era OK e resta OK
  });
});
