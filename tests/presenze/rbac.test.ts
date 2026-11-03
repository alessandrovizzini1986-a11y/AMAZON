import { describe, it, expect } from "vitest";
import { can } from "@/lib/rbac";

describe("permessi modulo presenze", () => {
  it("CONTROLLO: presenze, telepass/carburante e vademecum, nient'altro", () => {
    const u = { role: "CONTROLLO" as const };
    expect(can(u, "presenze.view")).toBe(true);
    expect(can(u, "presenze.run")).toBe(true);
    expect(can(u, "vademecum.view")).toBe(true);
    for (const a of ["telepass.view", "telepass.run", "telepass.anagrafiche"] as const) expect(can(u, a), a).toBe(true);
    for (const a of ["presenze.config", "vehicle.view", "dashboard.station", "users.manage", "orders.view", "officine.view"] as const) expect(can(u, a), a).toBe(false);
  });
  it("ADMIN ha anche la configurazione; RESP_MEZZI e DRIVER non vedono le presenze", () => {
    expect(can({ role: "ADMIN" }, "presenze.config")).toBe(true);
    expect(can({ role: "RESP_MEZZI" }, "presenze.view")).toBe(false);
    expect(can({ role: "DRIVER" }, "presenze.view")).toBe(false);
  });
});
