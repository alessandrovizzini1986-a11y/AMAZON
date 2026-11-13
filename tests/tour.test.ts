import { describe, it, expect } from "vitest";
import type { Role } from "@prisma/client";
import { chiaveTour, haTour, passiTour } from "@/content/tour";
import { menuPer } from "@/components/navModel";

const RUOLI: Role[] = ["ADMIN", "RESP_MEZZI", "CONTROLLO", "STAGISTA", "DRIVER"];

describe("tour di benvenuto", () => {
  it("lo hanno i ruoli che vedono la Home; la chiave cambia con il ruolo", () => {
    expect(RUOLI.filter(haTour)).toEqual(["ADMIN", "CONTROLLO"]);
    expect(passiTour({ role: "STAGISTA", nome: "X" })).toEqual([]);
    expect(chiaveTour("ADMIN")).not.toBe(chiaveTour("CONTROLLO"));
  });
  it("una tappa per ogni sezione che il ruolo vede, nessuna per le altre", () => {
    for (const role of RUOLI.filter(haTour)) {
      const passi = passiTour({ role, nome: "Prova" });
      const sezioni = passi.filter((p) => p.id.startsWith("gruppo-")).map((p) => p.id.slice(7));
      expect(sezioni, role).toEqual(menuPer(role).filter((g) => g.id !== "home").map((g) => g.id));
      expect(new Set(passi.map((p) => p.id)).size, role).toBe(passi.length);
      expect(passi[0].tipo).toBe("benvenuto"); expect(passi.at(-1)!.tipo).toBe("fine");
      expect(passi[0].titolo).toContain("Prova");
    }
    expect(passiTour({ role: "CONTROLLO", nome: "X" }).some((p) => p.id === "gruppo-gestione" || p.id === "gruppo-flotta")).toBe(false);
  });
  it("frasi brevi; il benvenuto dice il ruolo e se è appena cambiato", () => {
    const passi = passiTour({ role: "ADMIN", nome: "Prova", promosso: true });
    for (const p of passi) { expect(p.titolo.length, p.id).toBeLessThan(45); for (const t of p.testo) expect(t.length, p.id).toBeLessThan(190); expect(p.testo.length, p.id).toBeLessThanOrEqual(3); }
    expect(passi[0].testo.join(" ")).toContain("Da oggi hai il ruolo Admin");
    expect(passiTour({ role: "ADMIN", nome: "Prova" })[0].testo.join(" ")).toContain("Hai il ruolo Admin");
    // il testo non promette voci che il ruolo non vede
    expect(passiTour({ role: "CONTROLLO", nome: "X" }).find((p) => p.id === "gruppo-personale")!.testo.join(" ")).not.toContain("Telefoni");
  });
});
