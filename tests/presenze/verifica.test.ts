import { describe, it, expect } from "vitest";
import { fondiRichieste, leggiContratto, ripartoAtteso, tettoAccordo, verificaOre, type OreGiorno, type Persona, type Richiesta } from "@/domain/presenze/verifica";
import { addDays } from "@/domain/presenze/grid";

const g = (std = 0, x: Partial<OreGiorno> = {}): OreGiorno => ({ std, sup: 0, acc: 0, str: 0, ass: 0, ...x });
/** settimana 02–08/11/2026 (lunedì–domenica), tutta coperta */
const LUN = "2026-11-02";
const coperti = (k = "DER1|SIC") => new Map([[k, new Set(Array.from({ length: 30 }, (_, i) => addDays("2026-10-26", i)))]]);
const persona = (contratto: string, giorni: (OreGiorno | null)[], da = LUN, pop: "SIC" | "STD" = "SIC"): Persona =>
  ({ station: "DER1", pop, nome: "Rossi Mario", cf: "CF1", driverId: "A1", contratto, giorni: new Map(giorni.flatMap((o, i) => (o ? [[addDays(da, i), o] as [string, OreGiorno]] : []))) });
const run = (p: Persona, k = `${p.station}|${p.pop}`) => verificaOre([p], coperti(k), { mese: "2026-11", finoA: "2026-11-22" });

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
  it("riga Accordo non compilata: non è un errore; lo è lo Straordinario prima delle 39 ore", () => {
    // 48 ore con Accordo 1 e Straordinario 8: lo Standard è a 39, va bene così
    expect(run(persona("CTI FT", [g(8), g(8), g(8), g(8), g(7, { acc: 1 }), g(0, { str: 8 }), null])).richieste).toEqual([]);
    // 44 ore, Standard 39 e Straordinario 5, Accordo vuoto: va bene
    expect(run(persona("CTI FT", [g(8), g(8), g(8), g(8), g(7), g(0, { str: 5 }), null])).richieste).toEqual([]);
    // 38 ore: Standard 32 e Straordinario 6 → errore sul driver
    const e = run(persona("CTI FT", [g(8), g(8), g(8), g(8), null, g(0, { str: 6 }), null]));
    expect(e.richieste.map((r) => r.tipo)).toEqual(["STR_PRIMA"]);
    expect(e.richieste[0].testo).toContain("6 h da Straordinario a Standard: Straordinario 6 → 0, Standard 32 → 38");
    expect(e.richieste[0].chiave).toBe(`2026-11|DER1|SIC|CF1|STR_PRIMA|${LUN}`);
    // 44,5 ore: Standard 35,5, Accordo 1, Straordinario 8 → Standard fino a 39, il resto Straordinario (l'Accordo non conta nelle 39)
    const m = run(persona("CTI FT", [g(4), g(8), g(7.5), null, g(8, { acc: 0.5 }), g(8, { acc: 0.5 }), g(0, { str: 8 })]));
    expect(m.richieste.map((r) => r.tipo)).toEqual(["STR_PRIMA"]);
    expect(m.richieste[0].testo).toContain("3,5 h da Straordinario a Standard: Straordinario 8 → 4,5, Standard 35,5 → 39");
    // part time 24 ore che ne lavora 40: Standard 24, Supplementare 15, Straordinario 1 al posto dell'Accordo → va bene
    expect(run(persona("CTI PT 24H", [g(8), g(8), g(8), g(0, { sup: 8 }), g(0, { sup: 7, str: 1 }), null, null])).richieste).toEqual([]);
  });
  it("le assenze possono contare o no verso le 39 ore: si segnala solo se non torna in nessuno dei due modi", () => {
    // 4 giorni da 8 h + 8 h di ferie + 1 h di Accordo: torna contando le ferie
    expect(run(persona("CTI FT", [g(8), g(8), g(8), g(7, { acc: 1 }), g(0, { ass: 8 }), null, null])).richieste).toEqual([]);
    // 5 giorni lavorati (40 h) + un giorno di ferie: torna senza contare le ferie
    expect(run(persona("CTI FT", [g(8), g(8), g(8), g(8), g(7, { acc: 1 }), g(0, { ass: 8 }), null])).richieste).toEqual([]);
  });
  it("part time: un giorno in più è Supplementare; Standard oltre il contratto si segnala; l'Accordo sotto le 39 ore va bene", () => {
    expect(run(persona("CTI PT 24H", [g(8), g(8), g(8), g(0, { sup: 8 }), null, null, null])).richieste).toEqual([]);
    expect(run(persona("CTI PT 24H", [g(8), g(8), g(8), g(8), null, null, null])).richieste.map((r) => r.tipo)).toEqual(["STD_OLTRE"]);
    // la mezz'ora o l'ora in più del giorno nella riga Accordo è assorbita anche per part time e MOG
    expect(run(persona("CTI PT 24H", [g(8, { acc: 1 }), g(8), g(8), null, null, null, null])).richieste).toEqual([]);
    expect(run(persona("MOG 35%", [g(7, { acc: 0.5 }), g(7, { acc: 0.5 }), g(7), g(7), null, null, null], LUN, "STD")).richieste).toEqual([]);
    // ma non più delle ore assorbibili in una settimana (42 − 39 = 3)
    expect(run(persona("CTI PT 24H", [g(8, { acc: 2 }), g(8, { acc: 2 }), g(8, { acc: 1 }), null, null, null, null])).richieste.map((r) => r.tipo)).toEqual(["RIPARTO"]);
  });
  it("Supplementare su un full time; dispatcher esclusi dal riparto", () => {
    expect(run(persona("CTI FT", [g(8), g(8), g(8), g(0, { sup: 8 }), null, null, null])).richieste.map((r) => r.tipo)).toEqual(["SUP"]);
    expect(run(persona("DISPATCHER", [g(8), g(8), g(8), g(8), g(8), g(0, { str: 8 }), null])).richieste).toEqual([]);
  });
  it("7 giorni di fila anche a cavallo del mese; il 6° giorno di domenica è solo un elenco", () => {
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

describe("gruppi per il menu dei filtri", () => {
  it("ogni tipo sta in un solo gruppo", async () => {
    const { GRUPPI_TIPO, ORDINE_TIPO, gruppoDi } = await import("@/domain/presenze/verifica");
    const tutti = GRUPPI_TIPO.flatMap((g) => [...g.tipi]);
    expect([...tutti].sort()).toEqual([...ORDINE_TIPO].sort());
    expect(gruppoDi("ASS_ORE")).toBe("ORE");
    expect(new Set(tutti).size).toBe(tutti.length);
    expect(GRUPPI_TIPO.length).toBe(4);
    expect([gruppoDi("+1"), gruppoDi("STR_PRIMA"), gruppoDi("ACC"), gruppoDi("7GG"), gruppoDi("STD_OLTRE")]).toEqual(["GIORNI", "ORE", "ACCORDO", "RIPOSI", "ORE"]);
  });
});

describe("quale file leggere per un mese", () => {
  it("il mese in testa al nome del file", async () => {
    const { prefissoMese } = await import("@/lib/presenze/carica");
    expect([prefissoMese("11_Tracking_DER1.xlsm"), prefissoMese("08_Tracking.xlsx"), prefissoMese("Tracking_DER1.xlsx"), prefissoMese("13_x.xlsx"), prefissoMese("2026_x.xlsx")]).toEqual([11, 8, null, null, null]);
  });
});

describe("assenza segnata con la sigla ma senza ore", () => {
  // come nel tracking vero: part time 60%, 39 ore lavorate in 5 giorni, giovedì «F» nella riga RIPOSO senza ore di ferie, sabato in Straordinario
  const sett = [g(0, { sup: 7.8 }), g(7.8), g(7.8), null, g(0, { sup: 7.8 }), g(0, { str: 7.8 }), null];
  it("le ferie senza ore contano lo stesso nelle 39: lo Straordinario del sabato non è un errore, si chiede solo di scrivere le ore", () => {
    const p = { ...persona("STD PT 60", sett, LUN, "STD"), sigle: new Map([[addDays(LUN, 3), "F"], [addDays(LUN, 0), "L1"]]) };
    const e = run(p);
    expect(e.richieste.map((r) => r.tipo)).toEqual(["ASS_ORE"]);
    expect(e.richieste[0].rif).toBe(addDays(LUN, 3));
    expect(e.richieste[0].testo).toContain("«F»");
    expect(e.richieste[0].testo).toContain("riga FERIE");
  });
  it("senza la sigla lo stesso Straordinario resta un errore", () => {
    expect(run(persona("STD PT 60", sett, LUN, "STD")).richieste.map((r) => r.tipo)).toEqual(["STR_PRIMA"]);
  });
  it("se le ore di ferie ci sono, o la sigla non è un'assenza, nessuna richiesta in più", () => {
    const conOre = [...sett]; conOre[3] = g(0, { ass: 7.8 });
    expect(run({ ...persona("STD PT 60", conOre, LUN, "STD"), sigle: new Map([[addDays(LUN, 3), "F"]]) }).richieste).toEqual([]);
    expect(run({ ...persona("STD PT 60", sett, LUN, "STD"), sigle: new Map([[addDays(LUN, 3), "R"]]) }).richieste.map((r) => r.tipo)).toEqual(["STR_PRIMA"]);
  });
});

describe("le assenze non retribuite contano nelle 39 ore", () => {
  // full time lun–ven: martedì ferie, venerdì sciopero, sabato lavorato in Straordinario
  const base = [g(8), g(0, { ass: 8 }), g(8), g(8), null, g(0, { str: 8 }), null];
  it("sciopero scritto come ore non retribuite: lo Straordinario del sabato è lecito", () => {
    const sett = [...base]; sett[4] = g(0, { nr: 8 });
    expect(run(persona("CTI FT", sett)).richieste).toEqual([]);
  });
  it("sciopero scritto solo come sigla nella riga RIPOSO: uguale, e non si chiede niente", () => {
    expect(run({ ...persona("CTI FT", base), sigle: new Map([[addDays(LUN, 4), "SCIOPERO"]]) }).richieste).toEqual([]);
    expect(run({ ...persona("CTI FT", base), sigle: new Map([[addDays(LUN, 4), "PNR"]]) }).richieste).toEqual([]);
  });
  it("senza lo sciopero segnato, lo stesso sabato in Straordinario resta da correggere", () => {
    expect(run(persona("CTI FT", base)).richieste.map((r) => r.tipo)).toEqual(["STR_PRIMA"]);
  });
});

describe("giustificativi della riga RIPOSO", () => {
  it("SWA, 4H, 8H e i turni L1–L4 chiudono il giorno senza anomalie", async () => {
    const { GIUSTIFICATIVI_DEFAULT, NON_GIUSTIFICATIVI } = await import("@/domain/presenze/regole");
    const codici = new Set(GIUSTIFICATIVI_DEFAULT.map((g) => g.codice));
    for (const c of ["SWA", "4H", "8H", "L1", "L2", "L3", "L4", "MEZZI", "UFF"]) expect(codici.has(c), c).toBe(true);
    for (const c of NON_GIUSTIFICATIVI) expect(codici.has(c), c).toBe(false);
  });
});
