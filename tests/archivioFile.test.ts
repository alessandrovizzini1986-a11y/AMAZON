import { describe, expect, it } from "vitest";
import { accetta, daTenere } from "@/lib/archivioFile";

describe("archivio file", () => {
  it("tiene i più recenti entro giorni e numero", () => {
    const oggi = new Date("2026-11-07T12:00:00Z");
    const xs = [{ hash: "a", usatoIl: "2026-11-06T00:00:00Z" }, { hash: "b", usatoIl: "2026-06-01T00:00:00Z" }, { hash: "c", usatoIl: "2026-11-07T00:00:00Z" }, { hash: "d", usatoIl: "2026-10-01T00:00:00Z" }];
    expect([...daTenere(xs, oggi, { giorni: 120, file: 2, maxByte: 1 })]).toEqual(["c", "a"]);
    expect(daTenere(xs, oggi).has("b")).toBe(false);
  });
  it("filtra per estensione", () => {
    expect(accetta(".xlsx,.xlsm", "A.XLSX")).toBe(true);
    expect(accetta(".pdf", "a.xlsx")).toBe(false);
    expect(accetta("", "x")).toBe(true);
  });
});
