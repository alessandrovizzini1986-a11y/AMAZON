import { describe, expect, it } from "vitest";
import { festiviAnno, festiviMese } from "@/domain/costi/festivi";

describe("4 ottobre, San Francesco", () => {
  it("festa nazionale dal 2026, non prima", () => {
    expect(festiviAnno(2026).some((f) => f.data === "2026-10-04" && f.station === "TUTTE")).toBe(true);
    expect(festiviAnno(2025).some((f) => f.data === "2025-10-04")).toBe(false);
  });
  it("conta nei festivi di ottobre di ogni station", () => {
    expect(festiviMese(2026, 10, "DLO2", festiviAnno(2026)).map((f) => f.data)).toContain("2026-10-04");
  });
});
