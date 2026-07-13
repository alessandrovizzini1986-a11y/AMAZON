import { describe, it, expect } from "vitest";
import { classifyDamageZones } from "@/domain/damageZones";

describe("classifyDamageZones", () => {
  it("riconosce paraurti posteriore", () => {
    expect(classifyDamageZones("BOTTA PARAURTI POSTERIORE")).toEqual(["paraurti-post"]);
  });

  it("riconosce parafango con lato", () => {
    expect(classifyDamageZones("Parafango Posteriore Destro")).toEqual(["ruota-post-dx"]);
  });

  it("combina più zone nella stessa descrizione", () => {
    const zones = classifyDamageZones("COFANO, SPECCHIETTI RETROVISORI, FARO FRENO POSTERIORE, TETTO");
    expect(zones).toEqual(expect.arrayContaining(["cofano", "tetto", "fanale-post"]));
  });

  it("riconosce fiancata con lato esplicito", () => {
    expect(classifyDamageZones("FIANCATA SX DANNEGGIATA")).toEqual(["fiancata-sx"]);
    expect(classifyDamageZones("FIANCATA DESTRA")).toEqual(["fiancata-dx"]);
  });

  it("nessun danno reale non produce zone", () => {
    expect(classifyDamageZones("Non ci sono danni presenti al veicolo")).toEqual([]);
    expect(classifyDamageZones("non visibili")).toEqual([]);
    expect(classifyDamageZones("")).toEqual([]);
  });

  it("danno diffuso da grandine", () => {
    expect(classifyDamageZones("Bolle da grandine su tutta la carrozzeria")).toContain("diffuso");
  });

  it("descrizione non riconoscibile ricade su non-classificato", () => {
    expect(classifyDamageZones("qualcosa di strano xyz123")).toEqual(["non-classificato"]);
  });
});
