import { describe, expect, it } from "vitest";
import { soloLettura } from "@/lib/telematica/comune";
import { campione, conta, LETTURE } from "@/lib/telematica/prova";

describe("telematica: solo letture", () => {
  it("le letture di prova passano tutte", () => {
    for (const l of [...LETTURE.TARGA, ...LETTURE.FLOTTAWEB]) expect(() => soloLettura(l.percorso)).not.toThrow();
  });
  it("i comandi sui mezzi sono bloccati", () => {
    for (const p of ["/unit/12/lockEngine", "/unit/12/unlockEngine", "/v2/unit/12/unlockDoors", "/unit/12/reset", "/unit/12/out1impulse", "/gps/senddestination", "/fleet/update", "/refuel/delete"]) expect(() => soloLettura(p)).toThrow();
  });
  it("il campione taglia gli elenchi e conta gli elementi", () => {
    const r = { units: Array.from({ length: 40 }, (_, i) => ({ id: i, nota: "x".repeat(500) })) };
    expect(conta(r)).toBe(40);
    const c = campione(r) as { units: { nota: string }[] };
    expect(c.units).toHaveLength(3);
    expect(c.units[0].nota.length).toBeLessThan(210);
  });
});
