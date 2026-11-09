import { describe, it, expect } from "vitest";
import { righeStorico } from "@/domain/fatture/storico";
import { indicatoriDs, meseClasse, meseDs, settimanaDs } from "@/domain/fatture/fatturato";
import { csv, numIt } from "./fix";

describe("§8.6 fatturato 2026 dallo storico (12.361 righe)", () => {
  const righe = righeStorico(csv("fatturato", "fatt_2026_completo_al_24-10.csv")).righe;
  it("mese × DS = atteso_fatturato_mensile_2026_per_DS.csv, totale 28.504.329,96", () => {
    const g = meseDs(righe, 2026);
    const att = csv("fatturato", "atteso_fatturato_mensile_2026_per_DS.csv");
    expect(g.righe).toEqual(att.map((r) => Number(r.mese)));
    const ko: string[] = [];
    for (const r of att) for (const [c, v] of Object.entries(r)) {
      if (c === "mese") continue;
      const got = c === "TOTALE" ? g.totRiga[r.mese] : g.valori[r.mese][c];
      if (Math.abs(got - numIt(v)) > 0.01) ko.push(`${r.mese}/${c}: ${got} != ${v}`);
    }
    expect(ko).toEqual([]);
    expect(g.totale).toBe(28504329.96);
  });
  it("mese × classe = atteso_fatturato_mensile_2026_per_classe.csv", () => {
    const g = meseClasse(righe, 2026);
    const att = csv("fatturato", "atteso_fatturato_mensile_2026_per_classe.csv");
    const ko: string[] = [];
    for (const r of att) for (const [c, v] of Object.entries(r)) {
      if (c === "mese") continue;
      if (Math.abs((g.valori[r.mese][c] ?? 0) - numIt(v)) > 0.01) ko.push(`${r.mese}/${c}: ${g.valori[r.mese][c]} != ${v}`);
    }
    expect(ko).toEqual([]);
    expect(Object.keys(att[0]).filter((c) => c !== "mese").every((c) => g.colonne.includes(c))).toBe(true);
  });
  it("settimana × DS e indicatori per DS coerenti con il totale", () => {
    expect(settimanaDs(righe, 2026).totale).toBe(28504329.96);
    const ind = indicatoriDs(righe, (r) => r.anno === 2026);
    expect(Math.round(ind.reduce((s, x) => s + x.avere, 0) * 100) / 100).toBe(28504329.96);
    const dlo2 = ind.find((x) => x.ds === "DLO2")!;
    expect(dlo2.rotte).toBeGreaterThan(0);
    expect(dlo2.euroPerRotta).toBeCloseTo(dlo2.avereRotte / dlo2.rotte, 1);
  });
});

describe("indicatori: next e same day separati, contati come il forecast", () => {
  const r = (data: string, classe: string, quantita: number, avere: number) => ({ ds: "DLO2", anno: 2026, mese: 10, week: 44, data, classe, quantita, avere });
  it("same day = A + max(B, C) al giorno; €/rotta con extra = AVERE totale / rotte", () => {
    const [x] = indicatoriDs([r("2026-10-26", "ND_STANDARD", 10, 2700), r("2026-10-26", "ND_SWA", 2, 300), r("2026-10-26", "SD_A", 2, 400), r("2026-10-26", "SD_B", 3, 300), r("2026-10-26", "SD_C", 5, 400), r("2026-10-26", "EXTRA_CARBURANTE", 1, 340)], () => true, ["DLO2"]);
    expect([x.rotteND, x.rotteSD, x.rotte]).toEqual([12, 7, 19]);
    expect(x.euroND).toBe(250); expect(x.euroSD).toBe(157.14);
    expect(x.avere).toBe(4440); expect(x.euroTotalePerRotta).toBe(233.68);
  });
});
