import { describe, it, expect } from "vitest";
import { can, type Action } from "@/lib/rbac";

describe("permessi fatture Amazon (§0)", () => {
  const ha = (role: "ADMIN" | "CONTROLLO" | "RESP_MEZZI" | "DRIVER", a: Action) => can({ role }, a);
  it("CONTROLLO importa e vede il registro, non allinea né vede fatturato/forecast", () => {
    expect(ha("CONTROLLO", "fatture.import") && ha("CONTROLLO", "fatture.registro")).toBe(true);
    for (const a of ["fatture.allinea", "fatture.storico", "fatture.annulla", "fatturato.view", "forecast.import", "forecast.view"] as const) expect(ha("CONTROLLO", a), a).toBe(false);
  });
  it("RESP_MEZZI vede solo il fatturato; DRIVER niente; ADMIN tutto", () => {
    expect(ha("RESP_MEZZI", "fatturato.view")).toBe(true);
    for (const a of ["fatture.import", "fatture.registro", "fatture.allinea", "forecast.view"] as const) expect(ha("RESP_MEZZI", a), a).toBe(false);
    for (const a of ["fatture.import", "fatturato.view", "forecast.view"] as const) expect(ha("DRIVER", a), a).toBe(false);
    for (const a of ["fatture.import", "fatture.registro", "fatture.allinea", "fatture.storico", "fatture.annulla", "fatturato.view", "forecast.import", "forecast.view"] as const) expect(ha("ADMIN", a), a).toBe(true);
  });
});
