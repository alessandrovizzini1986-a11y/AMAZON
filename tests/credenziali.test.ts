import { describe, it, expect, beforeAll } from "vitest";
import { cifra, decifra } from "@/lib/credenziali";

describe("credenziali dei portali", () => {
  beforeAll(() => { process.env.AUTH_SECRET = "segreto-di-test-abbastanza-lungo"; delete process.env.CREDENZIALI_KEY; });
  it("cifra e decifra, mai in chiaro, iv diverso a ogni salvataggio", () => {
    const a = cifra("Prova@@2026!"), b = cifra("Prova@@2026!");
    expect(a).not.toContain("Prova");
    expect(a).not.toBe(b);
    expect(decifra(a)).toBe("Prova@@2026!");
  });
  it("con un'altra chiave non si legge", () => {
    const a = cifra("x");
    process.env.CREDENZIALI_KEY = "altra-chiave";
    expect(() => decifra(a)).toThrow();
    delete process.env.CREDENZIALI_KEY;
  });
});
