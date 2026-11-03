import { describe, it, expect } from "vitest";
import { classifica, isRotta } from "@/domain/fatture/classifica";
import { normalizzaNumero } from "@/domain/fatture/numero";
import { csv } from "./fix";


describe("§8.2 classifica", () => {
  const righe = csv("classificazione_descrizioni.csv").map((r) => [r.Descrizione, r.classe, r.is_rotta]);
  it("187 descrizioni → classe attesa e is_rotta", () => {
    expect(righe.length).toBe(187);
    const ko = righe.filter(([d, c, r]) => classifica(d) !== c || String(isRotta(classifica(d))) !== r.toLowerCase()).map(([d, c]) => `${d} → ${classifica(d)} (atteso ${c})`);
    expect(ko).toEqual([]);
  });
});

describe("§8.3 numero", () => {
  it("normalizza refusi, maiuscole e spazi", () => {
    expect(normalizzaNumero(" nv-it3jdbf-0002032 ")).toBe("INV-IT3JDBF-0002032");
    expect(normalizzaNumero("V-IT3JDBF-0002032")).toBe("INV-IT3JDBF-0002032");
    expect(normalizzaNumero("INV-IT3JDBF-0002032")).toBe("INV-IT3JDBF-0002032");
  });
});
