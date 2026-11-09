import { describe, expect, it } from "vitest";
import { reale } from "@/domain/forecast/previsione";

const r = (data: string, classe: string, quantita: number, avere: number) => ({ ds: "DER1", data, classe, quantita, avere });

describe("fatturato reale contato come il forecast", () => {
  const righe = [
    r("2026-10-26", "ND_STANDARD", 10, 2725), r("2026-10-26", "ND_SWA", 2, 300),
    r("2026-10-26", "SD_A", 3, 600), r("2026-10-26", "SD_B", 4, 500), r("2026-10-26", "SD_C", 3, 300),
    r("2026-10-27", "SD_B", 1, 125), r("2026-10-27", "SD_C", 2, 200),
    r("2026-10-26", "EXTRA_CARBURANTE", 1, 190), r("2026-10-26", "EXTRA_INCENTIVI", 1, 999),
  ];
  it("same day = A + max(B, C) per giorno; next tutte le ND", () => {
    const x = reale(righe, "DER1", "2026-10-25")!;
    expect(x.rotteND).toBe(12);
    expect(x.rotteSD).toBe(3 + 4 + 2);
    expect(x.rotte).toBe(21);
  });
  it("€ totali invariati; extra previsti divisi in proporzione alle rotte, incentivi esclusi", () => {
    const x = reale(righe, "DER1", "2026-10-25")!;
    expect(x.avere).toBe(2725 + 300 + 600 + 500 + 300 + 125 + 200 + 190);
    expect(x.avereND).toBeCloseTo(3025 + (190 * 12) / 21, 2);
    expect(x.avereSD).toBeCloseTo(1725 + (190 * 9) / 21, 2);
  });
});
