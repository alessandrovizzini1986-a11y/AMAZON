import { describe, expect, it } from "vitest";
import { fatturataTutta, giorniSettimana } from "@/domain/forecast/settimane";

describe("settimana fatturata", () => {
  const w = "2026-10-25"; // wk44, sabato 31/10
  it("tutti e 7 i giorni con fattura e sabato passato → sì, anche prima dei 14 giorni", () => {
    expect(fatturataTutta(w, "2026-11-09", new Set(giorniSettimana(w)))).toBe(true);
  });
  it("manca un giorno o la settimana non è finita → no", () => {
    expect(fatturataTutta(w, "2026-11-09", new Set(giorniSettimana(w).slice(0, 6)))).toBe(false);
    expect(fatturataTutta(w, "2026-10-31", new Set(giorniSettimana(w)))).toBe(false);
  });
});
