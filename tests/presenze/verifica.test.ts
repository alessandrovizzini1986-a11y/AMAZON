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
    expect(e.richieste[0].testo).toContain("il 07/11 ci sono 6 h in Straordinario, ma secondo me sono Standard");
    expect(e.settimane.find((x) => x.lunedi === LUN)!.esito).toContain("Straordinario 6 → 0, Standard 32 → 38");
    expect(e.richieste[0].chiave).toBe(`2026-11|DER1|SIC|CF1|STR_PRIMA|${LUN}`);
    // 44,5 ore: Standard 35,5, Accordo 1, Straordinario 8 → Standard fino a 39, il resto Straordinario (l'Accordo non conta nelle 39)
    const m = run(persona("CTI FT", [g(4), g(8), g(7.5), null, g(8, { acc: 0.5 }), g(8, { acc: 0.5 }), g(0, { str: 8 })]));
    expect(m.richieste.map((r) => r.tipo)).toEqual(["STR_PRIMA"]);
    expect(m.richieste[0].testo).toContain("il 08/11 ci sono 8 h in Straordinario, ma secondo me 3,5 h sono Standard");
    expect(m.settimane.find((x) => x.lunedi === LUN)!.esito).toContain("Straordinario 8 → 4,5, Standard 35,5 → 39");
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
  it("una giornata con più di 8h24 di Standard non è più un errore", () => {
    expect(run(persona("CTI FT", [g(9), null, null, null, null, null, null])).richieste).toEqual([]);
    expect(run(persona("CTI FT", [g(8.5), g(8.5), g(8), g(7), g(7), null, null])).richieste).toEqual([]);
  });
});

describe("le richieste tengono lo stato tra un controllo e l'altro", () => {
  const r = (chiave: string, testo = "t"): Richiesta => ({ chiave, mese: "2026-11", station: "DER1", pop: "SIC", driver: "X", tipo: "+1", rif: "2026-11-03", periodo: "03/11", testo, breve: "b" });
  it("nuova = da creare; già OK resta; sparita = risolta; OK con dati cambiati si riapre", () => {
    const salvate = [
      { chiave: "2026-11|DER1|a", stato: "OK" as const, testo: "t" }, { chiave: "2026-11|DER1|b", stato: "RICHIESTA" as const, testo: "t" },
      { chiave: "2026-11|DER1|c", stato: "OK" as const, testo: "vecchio" }, { chiave: "2026-11|DER2|d", stato: "DA_FARE" as const, testo: "t" },
      { chiave: "2026-11|DER1|e", stato: "OK" as const, testo: "t" }, { chiave: "2026-11|DER1|f", stato: "RISOLTA" as const, testo: "t" },
    ];
    const f = fondiRichieste(salvate.map((x) => ({ ...x, breve: "b" })), [r("2026-11|DER1|a"), r("2026-11|DER1|c", "nuovo"), r("2026-11|DER1|n"), r("2026-11|DER1|f")], ["DER1"], "2026-11");
    expect(f.crea.map((x) => x.chiave)).toEqual(["2026-11|DER1|n"]);
    expect(f.aggiorna).toEqual([
      { chiave: "2026-11|DER1|c", stato: "DA_FARE", testo: "nuovo", breve: "b", riaperta: true },
      { chiave: "2026-11|DER1|f", stato: "DA_FARE", testo: "t", breve: "b", riaperta: true },
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
    expect(GRUPPI_TIPO.length).toBe(5);
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
  it("part time: le ferie senza ore contano nelle 39 (lo Straordinario del sabato non è un errore) e non si chiede di scrivere le ore", () => {
    const p = { ...persona("STD PT 60", sett, LUN, "STD"), sigle: new Map([[addDays(LUN, 3), "F"], [addDays(LUN, 0), "L1"]]) };
    expect(run(p).richieste).toEqual([]);
  });
  it("tempo pieno con la settimana non piena: si chiede di scrivere le ore", () => {
    const ft = [g(8), g(8), g(8), null, g(8), null, null];
    const e = run({ ...persona("CTI FT", ft), sigle: new Map([[addDays(LUN, 3), "F"]]) });
    expect(e.richieste.map((r) => r.tipo)).toEqual(["ASS_ORE"]);
    expect(e.richieste[0].rif).toBe(addDays(LUN, 3));
    expect(e.richieste[0].testo).toContain("«F»"); expect(e.richieste[0].testo).toContain("riga FERIE");
    expect(e.richieste[0].breve).toBe("«F» senza ore: inserire le ore nella riga FERIE");
  });
  it("non è da contratto: MOG, tempo pieno con 5 giorni già pieni, domenica e festivo → nessuna richiesta", () => {
    const quattro = [g(8), g(8), g(8), null, g(8), null, null];
    expect(run({ ...persona("MOG 35", quattro, LUN, "STD"), sigle: new Map([[addDays(LUN, 3), "M"]]) }).richieste).toEqual([]);
    const cinque = [g(7.8), g(7.8), g(7.8), g(7.8), g(7.8), null, null];
    expect(run({ ...persona("CTI FT", cinque), sigle: new Map([[addDays(LUN, 5), "M"]]) }).richieste).toEqual([]);
    expect(run({ ...persona("CTI FT", quattro), sigle: new Map([[addDays(LUN, 6), "M"]]) }).richieste).toEqual([]);
    // 1° novembre 2026 è domenica; l'8 dicembre no: prova con una festa in mezzo alla settimana
    const e = verificaOre([{ ...persona("CTI FT", quattro, "2026-12-07"), sigle: new Map([["2026-12-08", "F"]]) }], coperti("DER1|SIC"), { mese: "2026-12", finoA: "2026-12-13" });
    expect(e.richieste.filter((r) => r.tipo === "ASS_ORE")).toEqual([]);
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
  it("SWA, 4H, 8H e i turni L1–L4, C1, C1+ e N chiudono il giorno senza anomalie", async () => {
    const { GIUSTIFICATIVI_DEFAULT, NON_GIUSTIFICATIVI } = await import("@/domain/presenze/regole");
    const codici = new Set(GIUSTIFICATIVI_DEFAULT.map((g) => g.codice));
    for (const c of ["SWA", "4H", "8H", "L1", "L2", "L3", "L4", "C1", "C1+", "N", "AFFIANCAMENTO", "AFFIANCO", "AFF", "MEZZI", "UFF"]) expect(codici.has(c), c).toBe(true);
    for (const c of NON_GIUSTIFICATIVI) expect(codici.has(c), c).toBe(false);
  });
});

describe("fatte le 39 ore di Standard, il resto va tutto in Straordinario", () => {
  it("39 ore da lunedì a sabato e 8 di domenica scritte in Standard: le 8 ore vanno tutte in Straordinario", () => {
    // come nel tracking vero: 5 giorni + la domenica, con 1 ora di Accordo già scritta
    const e = run(persona("CTI FT", [g(8), g(8), g(8), null, g(8), g(7, { acc: 1 }), g(8)]));
    expect(e.richieste.map((r) => r.tipo)).toEqual(["STD_OLTRE"]);
    expect(e.richieste[0].testo).toContain("le 8 h di Standard del 08/11 secondo me vanno in Straordinario");
    expect(e.richieste[0].testo).not.toContain("Accordo");
    expect(e.settimane.find((x) => x.lunedi === LUN)!.esito).toContain("Standard 47 → 39, Straordinario 0 → 8");
  });
  it("se la domenica è già in Straordinario non si chiede niente", () => {
    expect(run(persona("CTI FT", [g(8), g(8), g(8), null, g(8), g(7, { acc: 1 }), g(0, { str: 8 })])).richieste).toEqual([]);
  });
  it("part time: lo Standard oltre le sue ore va in Supplementare", () => {
    const e = run(persona("CTI PT 24H", [g(8), g(8), g(8), g(6), null, null, null]));
    expect(e.richieste.map((r) => r.tipo)).toEqual(["STD_OLTRE"]);
    expect(e.richieste[0].testo).toContain("le 6 h di Standard del 05/11 secondo me vanno in Supplementare.");
    expect(e.richieste[0].testo).not.toMatch(/si ferma|parte dopo|massimo/);
  });
});

describe("straordinario di giornata", () => {
  it("part time sotto le 39 ore con una giornata oltre le 8 ore: l'ora in più può stare in Straordinario", () => {
    // come nel tracking vero: 30 ore lavorate + 8 di ferie, sabato Standard 8 + Accordo 0,5 + Straordinario 1
    const sett = [g(0, { sup: 4 }), null, g(0, { sup: 8 }), g(0, { ass: 8 }), g(8, { acc: 0.5 }), g(8, { acc: 0.5, str: 1 }), null];
    expect(run(persona("CTI PT", sett)).richieste).toEqual([]);
  });
  it("vale solo per le ore oltre l'ottava di quel giorno", () => {
    // sabato 8 ore di Standard + 3 di Straordinario: tutte e 3 oltre l'ottava ora → va bene
    expect(run(persona("CTI PT 24H", [g(8), g(8), null, null, null, g(8, { str: 3 }), null])).richieste).toEqual([]);
    // sabato 4 ore di Standard + 3 di Straordinario (7 ore in tutto): non c'è nessuna ora oltre l'ottava → errore
    const e = run(persona("CTI PT 24H", [g(8), g(8), null, null, null, g(4, { str: 3 }), null]));
    expect(e.richieste.map((r) => r.tipo)).toEqual(["STR_PRIMA"]);
    expect(e.richieste[0].testo).toContain("il 07/11 ci sono 3 h in Straordinario, ma secondo me sono Supplementare");
  });
});

describe("DER2: i part time sono trattati come MOG", () => {
  const cop = new Map([["DER2|SIC", new Set(Array.from({ length: 30 }, (_, i) => addDays("2026-10-26", i)))]]);
  const aDer2 = (p: Persona) => verificaOre([{ ...p, station: "DER2" }], cop, { mese: "2026-11", finoA: "2026-11-22" });
  it("part time da 24 ore con 39 ore tutte in Standard: a DER2 non si chiede il Supplementare, altrove sì", () => {
    const sett = [g(8), g(8), g(8), g(8), g(7), null, null];
    expect(run(persona("CTI PT 24H", sett)).richieste.map((r) => r.tipo)).toEqual(["STD_OLTRE"]);
    expect(aDer2(persona("CTI PT 24H", sett)).richieste).toEqual([]);
  });
  it("Supplementare su un contratto non part time: a DER2 non si segnala, altrove sì", () => {
    const sett = [g(8), g(8), g(8), g(8), g(0, { sup: 7 }), null, null];
    expect(run(persona("CTI FT", sett)).richieste.map((r) => r.tipo)).toEqual(["SUP"]);
    expect(aDer2(persona("CTI FT", sett)).richieste).toEqual([]);
  });
  it("anche a DER2 lo Straordinario prima delle 39 ore resta un errore", () => {
    expect(aDer2(persona("CTI PT 24H", [g(8), g(8), g(8), null, null, g(4, { str: 3 }), null])).richieste.map((r) => r.tipo)).toEqual(["STR_PRIMA"]);
  });
});

describe("messaggio per l'OS", () => {
  it("saluto con il solo nome, frasi dirette e una sola formula finale", async () => {
    const { componi, TESTI } = await import("@/domain/presenze/messaggi");
    const m = componi("DER1", TESTI.aperturaVerifica(TESTI.salutoNome("Mario Rossi"), "DER1", "11/2026", "22/11", 2), [{ titolo: "Straordinario prima delle 39 ore", colonne: ["Driver", "Tipo", "Cosa serve"], righe: [["A", "STD", "x"], ["B", "STD", "y"]] }], TESTI.chiusuraVerifica);
    expect(m.testo.split("\n")[0]).toBe("Ciao Mario, ci sono 2 punti da verificare sui tracking di DER1 di 11/2026 (fino al 22/11):");
    expect(m.testo.match(/Puoi verificare e farmi sapere\?/g)!.length).toBe(1);
    expect(m.testo.trim().endsWith("Puoi verificare e farmi sapere? Grazie!")).toBe(true);
    expect(TESTI.salutoNome(null)).toBe("Ciao");
  });
});

describe("lo stesso lavoratore in tutti e due i tracking", () => {
  const cop = new Map([["DER1|SIC", new Set(Array.from({ length: 30 }, (_, i) => addDays("2026-10-26", i)))], ["DER1|STD", new Set(Array.from({ length: 30 }, (_, i) => addDays("2026-10-26", i)))]]);
  const sett = [g(8), g(8), g(8), g(8), g(7), null, null];
  const v = (pp: Persona[]) => verificaOre(pp, cop, { mese: "2026-11", finoA: "2026-11-22" }).richieste.filter((r) => r.tipo === "DOPPIO");
  it("stesso codice fiscale in STD e SIC con ore negli stessi giorni: una richiesta grave, con i giorni", () => {
    const r = v([persona("CTI FT", sett, LUN, "SIC"), { ...persona("MOG 35", sett, LUN, "STD"), nome: "Mario Rossi" }]);
    expect(r.length).toBe(1);
    expect(r[0].testo).toContain("stesso codice fiscale");
    expect(r[0].testo).toContain("con ore in tutti e due il 02/11, 03/11");
    expect(r[0].pop).toBe("STD+SIC");
  });
  it("riconosciuto anche per ID driver o per nome; persone diverse no", () => {
    expect(v([{ ...persona("CTI FT", sett, LUN, "SIC"), cf: "" }, { ...persona("MOG 35", sett, LUN, "STD"), cf: "ALTRO" }])[0].testo).toContain("stesso ID driver");
    expect(v([{ ...persona("CTI FT", sett, LUN, "SIC"), cf: "", driverId: "" }, { ...persona("MOG 35", sett, LUN, "STD"), cf: "", driverId: "B2", nome: "MARIO ROSSI" }])[0].testo).toContain("stesso nome");
    expect(v([persona("CTI FT", sett, LUN, "SIC"), { ...persona("MOG 35", sett, LUN, "STD"), cf: "CF9", driverId: "Z9", nome: "Altro Nome" }])).toEqual([]);
  });
  it("in giorni diversi (passaggio da un contratto all'altro) lo segnala comunque, dicendolo", () => {
    const r = v([persona("CTI FT", [null, null, null, g(8), g(8), null, null], LUN, "SIC"), persona("MOG 35", [g(8), g(8), null, null, null, null, null], LUN, "STD")]);
    expect(r[0].testo).toContain("in giorni diversi");
  });
});

describe("tabellina per gli OS", () => {
  it("un punto per riga, per driver e giorno; la settimana con più giorni si divide", async () => {
    const { componiTabellina, puntiVerifica, TESTI } = await import("@/domain/presenze/messaggi");
    const punti = puntiVerifica([
      { driver: "ROSSI MARIO", pop: "SIC", periodo: "09/11–15/11", testo: "lungo", breve: "14/11: Straordinario 4 h → Standard? · 12/11: Straordinario 8 h, di cui 2 h → Standard?" },
      { driver: "BIANCHI ANNA", pop: "STD", periodo: "10/11", testo: "lungo", breve: "Trasferta senza rotta Amazon: cosa ha fatto?" },
      { driver: "ROSSI MARIO", pop: "SIC", periodo: "03/11", testo: "vecchia riga senza testo breve", breve: null },
    ]);
    expect(punti.map((x) => `${x.driver}|${x.quando}|${x.cosa}`)).toEqual([
      "BIANCHI ANNA|10/11|Trasferta senza rotta Amazon: cosa ha fatto?", "ROSSI MARIO|03/11|Vecchia riga senza testo breve",
      "ROSSI MARIO|12/11|Straordinario 8 h, di cui 2 h → Standard?", "ROSSI MARIO|14/11|Straordinario 4 h → Standard?",
    ]);
    const m = componiTabellina("DER1", TESTI.aperturaVerifica("Ciao Mario", "DER1", "11/2026", "22/11", punti.length), punti);
    expect(m.nAnomalie).toBe(4);
    expect(m.testo.split("\n")).toEqual(["Ciao Mario, ci sono 4 punti da verificare sui tracking di DER1 di 11/2026 (fino al 22/11):", "", "BIANCHI ANNA (STD)", "  • 10/11 — Trasferta senza rotta Amazon: cosa ha fatto?", "ROSSI MARIO (SIC)", "  • 03/11 — Vecchia riga senza testo breve", "  • 12/11 — Straordinario 8 h, di cui 2 h → Standard?", "  • 14/11 — Straordinario 4 h → Standard?", "", "Puoi verificare e farmi sapere? Grazie!"]);
    expect(m.html.match(/<tr>/g)).toHaveLength(5); expect(m.html.match(/<strong>ROSSI MARIO<\/strong>/g)).toHaveLength(1);
  });
  it("cambiare solo il testo breve non riapre e non cambia lo stato", () => {
    const base = { chiave: "2026-11|DER1|SIC|X|+1|2026-11-03", mese: "2026-11", station: "DER1" as const, pop: "SIC", driver: "X", tipo: "+1" as const, rif: "2026-11-03", periodo: "03/11", testo: "t", breve: "nuovo" };
    const f = fondiRichieste([{ chiave: base.chiave, stato: "OK", testo: "t", breve: null }], [base], ["DER1"], "2026-11");
    expect(f.crea).toEqual([]); expect(f.aggiorna).toEqual([{ chiave: base.chiave, stato: "OK", testo: "t", breve: "nuovo", riaperta: false }]);
  });
});

describe("ID di un altro driver nel blocco", () => {
  it("diventa una richiesta per l'OS, con il testo breve per la tabellina", async () => {
    const { richiesteDaAmazon } = await import("@/domain/presenze/verifica");
    const e = { station: "DVN1", dettaglio: [], nonInTracking: [], anomalie: [{ file: "STD", riga: 888, driver: "Verdi Luca", codice: "ID_ALTRUI", breve: "Nel suo blocco c'è l'ID di Rossi Mario alla riga 900 (Indennità Trasferta): va corretto", anomalia: "Nel blocco c'è l'ID di un altro driver (Rossi Mario) alla riga 900 (Indennità Trasferta) e manca il suo: ID ignorato, driver cercato per nome" }, { file: "STD", riga: 3, driver: "X", anomalia: "altro" }] };
    const r = richiesteDaAmazon(e as never, "2026-11");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: "ID", pop: "STD", driver: "Verdi Luca", station: "DVN1", periodo: "11/2026", breve: "Nel suo blocco c'è l'ID di Rossi Mario alla riga 900 (Indennità Trasferta): va corretto" });
  });
});

describe("di chi è un ID: lo dice Amazon", () => {
  it("stessa persona anche con nome e cognome invertiti o un secondo nome; righe in breve", async () => {
    const { stessaPersona, righeInBreve } = await import("@/domain/presenze/controlloSettimanale");
    expect(stessaPersona("ROSSI MARIO", "Mario Rossi")).toBe(true); expect(stessaPersona("Luigi Junior Leone", "LEONE LUIGI")).toBe(true);
    expect(stessaPersona("Rossi Mario", "Rossi Maria")).toBe(false); expect(stessaPersona("", "Rossi")).toBe(false);
    expect(righeInBreve([901, 902, 903, 904, 905, 906])).toBe("901–906"); expect(righeInBreve([913, 901, 902])).toBe("901–902, 913");
  });
});

describe("dispatcher e addetti ai mezzi scritti in modo diverso nel tracking", () => {
  it("vale anche senza un pezzo del nome o in un altro ordine, ma non con una parola sola", async () => {
    const { nomeInElenco } = await import("@/domain/presenze/controlloSettimanale");
    const elenco = new Set(["NAVAS CASTILLO FREDDY HERNAN", "LEONE LUIGI JUNIOR"]);
    expect(nomeInElenco(elenco, "FREDDY HERNAN")).toBe(true); expect(nomeInElenco(elenco, "Luigi Junior Leone")).toBe(true);
    expect(nomeInElenco(elenco, "FREDDY")).toBe(false); expect(nomeInElenco(elenco, "LEONE MARCO")).toBe(false);
  });
});

describe("richieste salvate prima del testo breve", () => {
  it("la frase lunga diventa il punto breve, con la data del giorno nel Quando", async () => {
    const { breveDaTesto, puntiVerifica } = await import("@/domain/presenze/messaggi");
    expect(breveDaTesto("Settimana 26/10–01/11, lavorate 40 h (MOG 35%): il 01/11 ci sono 8 h in Standard, ma secondo me 1 h va in Straordinario.")).toBe("01/11: Standard 8 h, di cui 1 h → Straordinario?");
    expect(breveDaTesto("Settimana 26/10–01/11, lavorate 48 h (CTI FT): le 8 h di Standard del 01/11 secondo me vanno in Straordinario.")).toBe("01/11: Standard 8 h → Straordinario?");
    expect(breveDaTesto("Settimana 09/11–15/11, lavorate 35,4 h (STD PT 60): il 12/11 ci sono 4 h in Straordinario, ma secondo me sono Supplementare; il 14/11 ci sono 7,8 h in Straordinario, ma secondo me 5 h sono Supplementare.")).toBe("12/11: Straordinario 4 h → Supplementare? · 14/11: Straordinario 7,8 h, di cui 5 h → Supplementare?");
    expect(breveDaTesto("il 02/11 c'è «M» nella riga RIPOSO ma mancano le ore nella riga MALATTIA: riesci a inserirle?")).toBe("02/11: «M» senza ore: inserire le ore nella riga MALATTIA");
    expect(breveDaTesto("il 19/11 ha la trasferta ma Amazon non lo vede in rotta: cosa ha fatto? (tracking 7,8 h, Amazon 9 pacchi).")).toBe("19/11: Trasferta senza rotta Amazon: cosa ha fatto?");
    expect(breveDaTesto("il 09/11 ha ore nel tracking ma non è su Amazon, senza trasferta né giustificativo: cosa ha fatto? (tracking 2 h).")).toBe("09/11: 2 h a tracking, non è su Amazon: cosa ha fatto?");
    expect(breveDaTesto("il 08/11 è in rotta su Amazon ma non lo trovo nei tracking della station: è un prestito, un nuovo assunto o un errore? (Amazon 26 pacchi).")).toBe("08/11: In rotta su Amazon (26 pacchi), non è nei tracking: prestito, nuovo assunto o errore?");
    const p = puntiVerifica([{ driver: "X", pop: "SIC", periodo: "16/11–22/11", testo: "Settimana 16/11–22/11, lavorate 41 h (CTI FT): il 20/11 ci sono 8 h in Standard, ma secondo me 1 h va in Straordinario.", breve: null }, { driver: "Y", pop: "STD", periodo: "16/11–22/11", testo: "Settimana 16/11–22/11: ci sono 14 h di Straordinario, mi sembrano tante. È giusto?", breve: null }]);
    expect(p.map((x) => `${x.quando}|${x.cosa}`)).toEqual(["20/11|Standard 8 h, di cui 1 h → Straordinario?", "16/11‑22/11|Ci sono 14 h di Straordinario, mi sembrano tante. È giusto?"]);
  });
});
