import { describe, it, expect } from "vitest";
describe("fatture e forecast: DVN5 e DVN6 sono rotte extra di DVN1", async () => {
  const { DS_FATTURATO, codiciDs, dsAmazon } = await import("@/domain/fatture/fatturato");
  it("accorpate in DVN1, le altre station invariate", () => {
    expect(["DVN5", "dvn6", "DVN1", "DLO2"].map(dsAmazon)).toEqual(["DVN1", "DVN1", "DVN1", "DLO2"]);
    expect(codiciDs("DVN1")).toEqual(["DVN1", "DVN5", "DVN6"]);
    expect(codiciDs("DER1")).toEqual(["DER1"]);
    expect(DS_FATTURATO).not.toContain("DVN5");
  });
});
