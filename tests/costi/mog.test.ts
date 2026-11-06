import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { leggiFoglio } from "@/lib/fatture/xlsxStream";
import { leggiLavoratori } from "@/domain/presenze/lavoratori";
import { contrattoDaRiga, controlloMog, isIntestazioneMog, mogDelMese, riepilogoMog, stessoNome, consolidamentiPrevisti, type ContrattoMog } from "@/domain/mog/mog";
import { esempio, grids, hasKit } from "./kit";

const haMog = hasKit && fs.existsSync(esempio("ADECCO_PS_2026_10.xlsx"));

describe("MOG: regole", () => {
  const c: ContrattoMog = { cf: "X", nome: "A", cognome: "B", station: "DLO4", sito: "Buccinasco", dataInizio: "2026-06-01", dataFine: "2026-12-31", pctMog: 35, oreMogMese: 59.2, oreMogSett: 13.65, giaConsolidato: null, rischioConsolidamento: null, mediaOreSemestre: null, ventiPctMog: null, meseProssimoConsolidamento: null, proroghe: null, oreRetribuite6m: null, oreEccedenti6m: null, mediaOreAnzianita: null, mesePrimoConsolidamento: null, meseConsolidato: null, supera20: null, pctDaConsolidare: null, nuovoMonteOre: null, nuovaPct: null, orarioSettConsolidato: null };
  it("MOG del mese come Adecco: ore al giorno (% × 169 / 26) × giorni lun–sab del contratto, max 26; aumenti dalla loro data", () => {
    expect(mogDelMese(c, "2026-10")).toBe(59.15); // ottobre 2026 ha 27 giorni lun–sab: si contano 26
    expect(mogDelMese({ ...c, dataFine: "2026-10-15" }, "2026-10")).toBeCloseTo(2.275 * 13, 2); // 1–15/10 senza le domeniche 4 e 11
    expect(mogDelMese({ ...c, dataInizio: "2026-10-15", dataFine: "2027-02-15" }, "2026-10")).toBe(34.13); // 15 giorni (lista Adecco: 34,125)
    expect(mogDelMese({ ...c, dataInizio: "2026-06-04", dataFine: "2026-10-04" }, "2026-10")).toBeCloseTo(6.825, 2); // 3 giorni
    expect(mogDelMese(c, "2026-10", [{ cf: "X", pctNuova: 50, validaDal: "2026-10-01" }])).toBe(84.5);
  });
  it("regole Adecco (integrazioni MOG ottobre 2026): malattia a ore MOG per giorno, contratto finito nel mese, assenze non retribuite contate", () => {
    const g = (d: string, v: Record<string, number>) => [d, v] as const;
    const lav = (cf: string, giorni: (readonly [string, Record<string, number>])[]) => ({ nome: `Y ${cf}`, cf, contratto: "MOG 42,76", driverId: "", matricola: "", giorni: Object.fromEntries(giorni) });
    const k = (cf: string, x: Partial<ContrattoMog>) => ({ ...c, cf, ...x });
    // malattia dal 7 al 30/10 (nel tracking solo 15 giorni da 8 h): vale 21 giorni lun–sab × 2,7794 h = 58,37 h, si integra il resto
    const malati = ["07", "08", "09", "10", "16", "17", "18", "22", "23", "24", "25", "26", "27", "28", "30"].map((d) => g(`2026-10-${d}`, { MALATTIA: 8 }));
    const [m] = controlloMog({ station: "DLO4", mese: "2026-10", lavoratori: [lav("M", malati)], contratti: [k("M", { pctMog: 42.76, oreMogMese: null })] });
    expect([m.stato, m.oreMog, m.computo, m.oreMancanti]).toEqual(["SOTTO MOG", 72.26, 58.4, 13.9]);
    // solo assenza ingiustificata (15 h), contratto finito il 9/10: MOG 8 giorni = 18,2 h, si integrano 3,2 h
    const [r] = controlloMog({ station: "DLO4", mese: "2026-10", lavoratori: [lav("R", [g("2026-10-01", { ASS_INGIUST: 8 }), g("2026-10-02", { ASS_INGIUST: 7 })])], contratti: [k("R", { dataInizio: "2026-06-09", dataFine: "2026-10-09" })] });
    expect([r.stato, r.oreMog, r.computo, r.oreMancanti]).toEqual(["SOTTO MOG", 18.2, 15, 3.2]);
    // non nel tracking, contratto finito il 4/10: integrazione pro-rata (3 giorni)
    const [o] = controlloMog({ station: "DLO4", mese: "2026-10", lavoratori: [], contratti: [k("O", { dataInizio: "2026-06-04", dataFine: "2026-10-04" })] });
    expect([o.stato, o.oreMancanti]).toEqual(["ZERO ORE", 6.83]);
  });
  it("nomi: ordine indifferente, sottoinsieme di token", () => {
    expect(stessoNome("Garcia Lopez Juan Carlos", "Juan Carlos Garcia")).toBe(true);
    expect(stessoNome("Rossi Mario", "Rossi Maria")).toBe(false);
  });
  it("proiezione durante il mese: A RISCHIO se la proiezione resta sotto MOG − 4 h", () => {
    const giorni: Record<string, { Standard: number }> = { "2026-10-01": { Standard: 1 }, "2026-10-02": { Standard: 1 } };
    const [e] = controlloMog({ station: "DLO4", mese: "2026-10", lavoratori: [{ nome: "B A", cf: "X", contratto: "", driverId: "", matricola: "", giorni }], contratti: [c], finoA: "2026-10-10" });
    expect(e.stato).toBe("A RISCHIO");
    expect(e.giorniResidui).toBe(15);
  });
});

describe.skipIf(!haMog)("MOG DLO4 ottobre 2026 (golden)", () => {
  // Regole Adecco (lista integrazioni MOG di ottobre 2026, CDC 1528): le 6 integrazioni DLO4 coincidono con quelle Adecco.
  // Il lavoratore con sola malattia tutto il mese non è nella lista Adecco: la malattia vale il MOG di ogni giorno, nessuna integrazione.
  it("32 OK, 6 SOTTO MOG (66,9 h = 1.395,54 €), nessuno a ZERO ORE (la malattia copre il MOG), 21 non in file", async () => {
    const contratti: ContrattoMog[] = [];
    const r = await leggiFoglio(fs.readFileSync(esempio("ADECCO_PS_2026_10.xlsx")), "PS", { intestazione: isIntestazioneMog, onRiga: (riga) => { const c = contrattoDaRiga(riga, Object.keys(riga)); if (c) contratti.push(c); } });
    expect(typeof r.rigaIntestazione[0]).toBe("number"); // A3 = data chiusura payroll (seriale)
    expect(contratti.filter((c) => c.station === "DLO4").length).toBe(38);
    const { lavoratori } = leggiLavoratori(await grids(esempio("tracking_ott26_dlo4", "10_Tracking_Amazon_Drivers_2026_STD_ADECCO_DLO4.xlsx")), 2026, 10);
    const es = controlloMog({ station: "DLO4", mese: "2026-10", lavoratori, contratti });
    const r2 = riepilogoMog(es);
    expect([r2.ok, r2.sotto, r2.nonInFile, r2.nonNelTracking, r2.zeroOre]).toEqual([32, 6, 21, 0, 0]);
    const malattia = es.find((e) => e.soloAssenze && e.pctMog === 59.08)!;
    expect([malattia.stato, malattia.oreMog, malattia.computo, malattia.oreMancanti]).toEqual(["OK", 99.85, 99.8, 0]);
    expect(es.filter((e) => e.stato === "SOTTO MOG").map((e) => e.oreMancanti).sort((a, b) => a - b)).toEqual([3.1, 3.1, 3.2, 11.1, 19.2, 27.2]);
    expect([r2.oreMancanti, Math.round(r2.costo * 100) / 100]).toEqual([66.9, 1395.54]);
    // consolidamenti previsti dal file (media 6 mesi > MOG + 20 %)
    const cons = consolidamentiPrevisti(contratti);
    expect(cons.length).toBeGreaterThan(0);
    expect(cons.every((k) => k.nuovaPct > (k.pctMog ?? 0))).toBe(true);
  }, 300_000);
});
