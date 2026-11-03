import { describe, it, expect } from "vitest";
import { NAV_BY_ROLE, menuAttivo, vociBarra } from "@/components/navModel";

describe("menu da telefono", () => {
  it("ogni sezione del ruolo è raggiungibile: barra (max 4) + menu", () => {
    for (const role of Object.keys(NAV_BY_ROLE) as (keyof typeof NAV_BY_ROLE)[]) {
      const { barra, menu, conMenu } = vociBarra(role);
      const tutte = [...NAV_BY_ROLE[role].main, ...NAV_BY_ROLE[role].admin].map((v) => v.href);
      expect([...barra, ...menu].map((v) => v.href).sort(), role).toEqual([...tutte].sort());
      expect(barra.length + (conMenu ? 1 : 0), role).toBeLessThanOrEqual(5);
    }
    expect(vociBarra("ADMIN").menu.map((v) => v.href)).toContain("/costi");
    expect(vociBarra("DRIVER")).toMatchObject({ conMenu: false });
  });
  it("il pulsante Menu è attivo quando la pagina non è nella barra", () => {
    const { barra } = vociBarra("ADMIN");
    expect(menuAttivo("/costi/fine-mese", barra)).toBe(true);
    expect(menuAttivo("/vehicles/abc", barra)).toBe(false);
  });
});
