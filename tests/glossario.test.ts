import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GLOSSARIO, pezziConSigle } from "@/content/glossario";

describe("glossario", () => {
  it("la pagina del vademecum contiene tutte le sigle (rigenera con npx tsx scripts/glossario-md.mts)", () => {
    const md = readFileSync("content/vademecum/18-glossario.md", "utf8");
    for (const g of GLOSSARIO) expect(md).toContain(`**${g.sigla}** | ${g.nome} |`);
  });
  it("sigle uniche", () => {
    expect(new Set(GLOSSARIO.map((g) => g.sigla)).size).toBe(GLOSSARIO.length);
  });
  it("riconosce le sigle una volta sola e non dentro le parole", () => {
    const p = pezziConSigle("Costi SIC e STD per DS: il SIC paga; DSPX e DER1 no; foglio F.O. del CDC.");
    expect(p.filter((x) => typeof x !== "string").map((x) => (x as { sigla: string }).sigla)).toEqual(["SIC", "STD", "DS", "F.O.", "CDC"]);
    expect(p.map((x) => (typeof x === "string" ? x : x.sigla)).join("")).toBe("Costi SIC e STD per DS: il SIC paga; DSPX e DER1 no; foglio F.O. del CDC.");
  });
});
