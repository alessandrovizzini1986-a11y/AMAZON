import { describe, it, expect } from "vitest";
import { mesiStima, settimaneFatturate, stimaMese } from "@/domain/forecast/stimaMese";
import type { Previsione } from "@/domain/forecast/previsione";

const prev = (ds: string, settimana: string, perGiorno: Record<string, number>, soloSD = false): Previsione => ({
  ds, settimana, week: 0, rotteND: 1, rotteSD: 0, sdDaMedia: false, soloSD, previstoND: 0, previstoSD: 0, previstoExtra: 0, totale: Object.values(perGiorno).reduce((a, b) => a + b, 0), tariffeStimate: [], nonMappate: 0, perGiorno,
});

describe("stima del mese", () => {
  const righe = [
    { ds: "DER1", data: "2026-09-30", classe: "ND_STANDARD", quantita: 1, avere: 100 }, // settimana 27/09 fatturata, giorni a cavallo
    { ds: "DER1", data: "2026-10-01", classe: "ND_STANDARD", quantita: 1, avere: 200 },
    { ds: "DER1", data: "2026-10-04", classe: "EXTRA_BONUS", quantita: 1, avere: 50 }, // solo extra: settimana 04/10 NON fatturata
    { ds: "DER1", data: "2025-10-15", classe: "ND_STANDARD", quantita: 1, avere: 900 },
  ];
  const previsioni = [
    prev("DER1", "2026-09-27", { "2026-09-30": 999, "2026-10-01": 999 }), // fatturata: ignorata
    prev("DER1", "2026-10-04", Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`2026-10-${String(4 + i).padStart(2, "0")}`, 10]))),
  ];
  it("fatturato + previsto delle sole settimane non fatturate; giorni senza dati; anno prima", () => {
    const [r] = stimaMese({ righe, previsioni, mesi: ["2026-10"] });
    expect(r).toMatchObject({ mese: "2026-10", ds: "DER1", fatturato: 250, previsto: 70, totale: 320, annoPrima: 900 });
    // ottobre: 1–3 fatturati (settimana 27/09), 4–10 previsti, 11–31 senza dati
    expect(r.giorniSenza).toBe(21);
    expect(r.quotaCerta).toBeCloseTo(250 / 320, 6);
    expect(settimaneFatturate(righe).has("DER1|2026-10-04")).toBe(false);
  });
  it("mesi: dal mese scorso all'ultimo coperto dal forecast", () => {
    expect(mesiStima("2026-11-03", "2027-01-17")).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"]);
    expect(mesiStima("2026-01-10", null)).toEqual(["2025-12", "2026-01"]);
  });
});
