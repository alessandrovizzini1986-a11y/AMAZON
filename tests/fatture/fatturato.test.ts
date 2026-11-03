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
