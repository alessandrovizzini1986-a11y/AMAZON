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

import { daFlottaweb, daTarga, targaPulita } from "@/lib/telematica/posizioni";
import { lettureDiProva } from "@/lib/telematica/prova";

describe("telematica: posizioni", () => {
  it("Targa: prende targa, coordinate e ora; salta chi non ha posizione", () => {
    const r = daTarga([{ plate: "ab 123 cd", name: "AB123CD", speed: 42, unitOperativeStatus: "MOVING", location: { latitude: 44.1, longitude: 12.4, timestamp: "2026-11-24T16:48:37Z" } }, { plate: "ZZ000ZZ", location: null }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ targa: "AB123CD", lat: 44.1, lon: 12.4, velocita: 42, quando: "2026-11-24T16:48:37Z" });
  });
  it("FlottaWeb: ricompone l'ora e salta i mezzi a coordinate zero", () => {
    const ora = { year: "2026", month: "11", day: "24", hour: "19", minute: "10", seconds: "05" };
    const r = daFlottaweb({ units: [{ vrn: "xb-ppt g", latitude: 45.4, longitude: 9.1, speed: 0, dateTime: ora }, { vrn: "NOPOS", latitude: 0, longitude: 0, dateTime: { year: "1970" } }] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ targa: "XBPPTG", quando: "2026-11-24T19:10:05" });
    expect(targaPulita(" fx-123.aa ")).toBe("FX123AA");
  });
  it("le letture sul singolo mezzo sono tutte letture consentite", () => {
    for (const l of [...lettureDiProva("TARGA", [{ idUnit: 7 }]), ...lettureDiProva("FLOTTAWEB", { units: [{ unitid: 9 }] })]) expect(() => soloLettura(l.percorso)).not.toThrow();
    expect(lettureDiProva("TARGA", [{ idUnit: 7 }]).length).toBeGreaterThan(2);
  });
  it("i segreti del portale non finiscono nel campione", () => {
    const c = campione({ userinfo: { api_key: "abc", name: "x" }, videoserver: { password: "p" } }) as { userinfo: { api_key: string; name: string }; videoserver: unknown };
    expect(c.userinfo.api_key).toBe("(nascosto)"); expect(c.userinfo.name).toBe("x"); expect(c.videoserver).toBe("(nascosto)");
  });
});
