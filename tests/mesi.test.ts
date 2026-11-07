import { describe, it, expect } from "vitest";
import { etichettaMese, meseDaUsare, meseSpostato, mesiTra } from "@/lib/mesi";

describe("mesi", () => {
  it("etichette in italiano e spostamenti tra anni", () => {
    expect(etichettaMese("2026-10")).toBe("Ottobre 2026");
    expect(meseSpostato("2026-01", -1)).toBe("2025-12");
    expect(meseSpostato("2026-12", 1)).toBe("2027-01");
    expect(mesiTra("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
  it("mese della pagina: indirizzo, poi mese ricordato, poi predefinito", () => {
    expect(meseDaUsare("2026-09", "2026-07", "2026-10")).toBe("2026-09");
    expect(meseDaUsare(undefined, "2026-07", "2026-10")).toBe("2026-07");
    expect(meseDaUsare("2026-13", "x", "2026-10")).toBe("2026-10");
  });
});
