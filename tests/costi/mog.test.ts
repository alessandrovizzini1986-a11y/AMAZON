import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { leggiFoglio } from "@/lib/fatture/xlsxStream";
import { leggiLavoratori } from "@/domain/presenze/lavoratori";
import { contrattoDaRiga, controlloMog, isIntestazioneMog, mogDelMese, riepilogoMog, stessoNome, type ContrattoMog } from "@/domain/mog/mog";
import { esempio, grids, hasKit } from "./kit";

const haMog = hasKit && fs.existsSync(esempio("ADECCO_PS_2026_10.xlsx"));

describe("MOG: regole", () => {
  const c: ContrattoMog = { cf: "X", nome: "A", cognome: "B", station: "DLO4", sito: "Buccinasco", dataInizio: "2026-06-01", dataFine: "2026-12-31", pctMog: 35, oreMogMese: 59.2, oreMogSett: 13.65, giaConsolidato: null, rischioConsolidamento: null, mediaOreSemestre: null, ventiPctMog: null, meseProssimoConsolidamento: null };
  it("MOG del mese: dal file, pro-rata se il contratto inizia/finisce nel mese, variazione da pct × 169", () => {
    expect(mogDelMese(c, "2026-10")).toBe(59.2);
    expect(mogDelMese({ ...c, dataFine: "2026-10-15" }, "2026-10")).toBe(Math.round(59.2 * 15 / 31 * 10) / 10);
    expect(mogDelMese(c, "2026-10", [{ cf: "X", pctNuova: 50, validaDal: "2026-10-01" }])).toBe(84.5);
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
  // Atteso del kit: 30 OK, 5 SOTTO MOG, 19 non in file, 3 non nel tracking (lavoratore 59,1 % ZERO ORE 99,9 h = 2.084 €).
  // Quel lavoratore però è nel tracking con 171 h di MALATTIA: per la regola §3 (malattia = assenza retribuita nel computo)
  // è OK, segnato "solo assenze". Qui si applica la regola: 31 OK, 2 non nel tracking, nessuno a ZERO ORE.
  it("31 OK (1 solo malattia), 5 SOTTO MOG (64 h = 1.335 €), 19 non in file, 2 non nel tracking", async () => {
    const contratti: ContrattoMog[] = [];
    const r = await leggiFoglio(fs.readFileSync(esempio("ADECCO_PS_2026_10.xlsx")), "PS", { intestazione: isIntestazioneMog, onRiga: (riga) => { const c = contrattoDaRiga(riga, Object.keys(riga)); if (c) contratti.push(c); } });
    expect(typeof r.rigaIntestazione[0]).toBe("number"); // A3 = data chiusura payroll (seriale)
    expect(contratti.filter((c) => c.station === "DLO4").length).toBe(38);
    const { lavoratori } = leggiLavoratori(await grids(esempio("tracking_ott26_dlo4", "10_Tracking_Amazon_Drivers_2026_STD_ADECCO_DLO4.xlsx")), 2026, 10);
    const es = controlloMog({ station: "DLO4", mese: "2026-10", lavoratori, contratti });
    const r2 = riepilogoMog(es);
    expect([r2.ok, r2.sotto, r2.nonInFile, r2.nonNelTracking, r2.zeroOre]).toEqual([31, 5, 19, 2, 0]);
    const malattia = es.find((e) => e.soloAssenze)!;
    expect([malattia.stato, malattia.oreMog, malattia.computo]).toEqual(["OK", 99.9, 171]);
    expect(es.filter((e) => e.stato === "SOTTO MOG").map((e) => e.gap).sort((a, b) => a! - b!)).toEqual([-27.2, -19.2, -11.2, -3.2, -3.2]);
    expect([r2.oreMancanti, Math.round(r2.costo)]).toEqual([64, 1335]);
    expect(es.filter((e) => e.stato === "NON NEL TRACKING").map((e) => e.dataFine).sort()).toEqual(["2026-10-01", "2026-10-09"]);
  }, 300_000);
});
