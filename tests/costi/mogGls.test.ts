import { describe, it, expect } from "vitest";
import { controlloMog, lavoratoriGls, riepilogoMog, type ContrattoMog } from "@/domain/mog/mog";
import { leggiLavoratori } from "@/domain/presenze/lavoratori";

// dati inventati: nessun nome o codice fiscale reale
const CF = "RSSMRA90A01H501U";
const foglio = (name: string, rows: unknown[][]) => ({ name, rows, formulas: new Set<string>(), notes: new Map<string, string>() });

describe("MOG: lavoratori su GLS", () => {
  it("chi è nel foglio GLS del tracking (di qualunque mese) è SU GLS, non a zero ore", () => {
    const gls = lavoratoriGls([
      foglio("10.26", [["Tipo", "Codice Fiscale"]]),
      foglio("gls", [["Data Inizio: 01/09/2026"], ["", "Tipo Contratto", "", "Lavoratore", "Driver ID", "Codice Fiscale", "Tipo"], ["", "MOG 35 GLS", "", "ROSSI MARIO", "X1", CF, "Standard"], ["", "MOG 35 GLS", "", "ROSSI MARIO", "X1", CF, "Totali"]]),
    ]);
    expect(gls).toEqual([{ nome: "ROSSI MARIO", cf: CF }]);
    const c = { cf: CF, nome: "Mario", cognome: "Rossi", station: "DER1", sito: "Valsamoggia", dataInizio: "2026-01-01", dataFine: "2026-12-31", pctMog: 35, oreMogMese: 59.2, oreMogSett: 13.65 } as ContrattoMog;
    const es = controlloMog({ station: "DER1", mese: "2026-10", lavoratori: [], contratti: [c], suGls: gls });
    expect([es[0].stato, es[0].costo]).toEqual(["SU GLS", 0]);
    expect(riepilogoMog(es)).toMatchObject({ suGls: 1, zeroOre: 0, costoZeroOre: 0 });
    // senza foglio GLS resta zero ore
    expect(controlloMog({ station: "DER1", mese: "2026-10", lavoratori: [], contratti: [c] })[0].stato).toBe("ZERO ORE");
  });
});

describe("tracking con la colonna Driver al posto di Lavoratore", () => {
  it("il nome viene dalla colonna Driver, l'ID da Driver ID", () => {
    const giorni = Array.from({ length: 31 }, (_, i) => i + 1);
    const rows = [
      ["Data Inizio: 01/10/2026", "", "", "Data fine: 31/10/2026"],
      [".", "Tipo Contratto", "Giorni contratto", "Driver", "Driver ID", "Codice Fiscale", "Tipo", ...giorni],
      ["", "MOG 35", "", "Mario Rossi", "A2TEST", null, "Standard", 7.8, ...giorni.slice(1).map(() => null)],
    ];
    const { lavoratori } = leggiLavoratori([foglio("10_26", rows) as never], 2026, 10);
    expect(lavoratori.map((l) => [l.nome, l.driverId, l.contratto])).toEqual([["Mario Rossi", "A2TEST", "MOG 35"]]);
  });
});
