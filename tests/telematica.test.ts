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

import { fusoRoma, giorniDelMese, giornoDaFlottaweb, giornoDaTarga, riepilogoMese, type RigaGiorno } from "@/domain/telematica";
import { ultimoPuntoFw } from "@/lib/telematica/posizioni";

describe("telematica: giorno e mese", () => {
  const seg = (reportType: string, dateBegin: string, dateEnd: string, mileage: number, extra = {}) => ({ reportType, dateBegin, dateEnd, mileage, formattedAddressBegin: "Via A", formattedAddressEnd: "Via B", positions: [], ...extra });
  it("Targa: km, orari, soste in mezzo alla giornata e rifornimenti", () => {
    const g = giornoDaTarga({
      totalMileage: 63.017, dateUsageBegin: "2026-11-23T09:41:45.000+01:00", dateUsageEnd: "2026-11-23T18:03:59.000+01:00", totalDriveTime: 14635, totalEngineOnTime: 17090, totalParkEngineOnTime: 2455, dailyMaximumSpeed: 133, drivingScore: { safety: { score: 5.9 } },
      usageSegments: [seg("INACTIVITY", "2026-11-23T00:00:00+01:00", "2026-11-23T09:41:45+01:00", 0), seg("USAGE", "2026-11-23T09:41:45+01:00", "2026-11-23T11:00:00+01:00", 30, { positions: [{ mileage: 14230, refuel: { refueledLiters: 41.5 } }] }),
        seg("INACTIVITY", "2026-11-23T11:00:00+01:00", "2026-11-23T11:20:00+01:00", 0), seg("USAGE", "2026-11-23T11:20:00+01:00", "2026-11-23T18:03:59+01:00", 33, { positions: [{ mileage: 14265.9, refuel: null }] }), seg("INACTIVITY", "2026-11-23T18:03:59+01:00", "2026-11-23T23:59:59+01:00", 0)],
    });
    expect(g).toMatchObject({ km: 63, guidaSec: 14635, fermoMotoreAccSec: 2455, velMax: 133, soste: 1, rifornimenti: 1, litri: 41.5, kmContatore: 14265.9 });
    expect(g.tappe).toHaveLength(5); expect(g.tappe[1]).toEqual({ t: "G", da: "09:41", a: "11:00", km: 30, dove: "Via B" });
  });
  it("Targa: mezzo fermo tutto il giorno → 0 km, nessun orario", () => {
    const g = giornoDaTarga({ totalMileage: 0, dateUsageBegin: "2026-11-23T00:00:00+01:00", usageSegments: [seg("INACTIVITY", "2026-11-23T00:00:00+01:00", "2026-11-23T23:59:59+01:00", 0)] });
    expect(g).toMatchObject({ km: 0, inizio: null, fine: null, soste: 0 });
    expect(giornoDaTarga(null).km).toBe(0);
  });
  it("FlottaWeb: km dal contachilometri, orari dai punti in movimento", () => {
    const g = giornoDaFlottaweb({ tot_km: 0, message: [{ dateTime: "2026-07-10 08:00:00", speed: 0, cronotachigrafo: 2700 }, { dateTime: "2026-07-10 08:30:00", speed: 30, cronotachigrafo: 2705 }, { dateTime: "2026-07-10 09:10:00", speed: 22, cronotachigrafo: 2714.2 }] }, "2026-07-10");
    expect(g.km).toBe(14.2); expect(g.inizio).toBe("2026-07-10T08:30:00+02:00"); expect(g.velMax).toBe(30);
  });
  it("fuso italiano e giorni del mese", () => {
    expect(fusoRoma("2026-11-23")).toBe("+01:00"); expect(fusoRoma("2026-07-10")).toBe("+02:00"); expect(giorniDelMese("2026-02")).toHaveLength(28);
  });
  it("riepilogo del mese: medie sui giorni usati e consumo", () => {
    const r = (targa: string, giorno: string, km: number, litri = 0): RigaGiorno => ({ fonte: "TARGA", targa, giorno, km, inizio: null, fine: null, guidaSec: 3600, motoreSec: 0, fermoMotoreAccSec: 1800, velMax: 90, punteggioSicurezza: 6, soste: 2, rifornimenti: litri ? 1 : 0, litri });
    const [a, b] = riepilogoMese([r("AA111AA", "2026-11-02", 100, 40), r("AA111AA", "2026-11-03", 0), r("AA111AA", "2026-11-04", 60), r("BB222BB", "2026-11-02", 0)], (t) => (t === "AA111AA" ? "DER1" : null));
    expect(a).toMatchObject({ targa: "AA111AA", station: "DER1", giorniUsati: 2, km: 160, kmMedi: 80, guidaOre: 3, litri: 40, kmPerLitro: 4, litri100km: 25, primoGiorno: "2026-11-02", ultimoGiorno: "2026-11-04" });
    expect(b).toMatchObject({ targa: "BB222BB", giorniUsati: 0, kmMedi: 0, kmPerLitro: null });
  });
  it("FlottaWeb sulla mappa: l'ultimo punto del percorso", () => {
    const p = ultimoPuntoFw({ message: [{ lat: 45.41, lon: 9.09, speed: 0, dateTime: "2026-11-24 19:10:00" }, { lat: 45.4, lon: 9.08, speed: 0, dateTime: "2026-11-23 00:09:53" }] }, "XBPPTG");
    expect(p).toMatchObject({ targa: "XBPPTG", lat: 45.41, quando: "2026-11-24T19:10:00" });
    expect(ultimoPuntoFw({ message: [] }, "X")).toBeNull();
  });
});

import { bloccato, menuPer, paginaIniziale } from "@/components/navModel";
import { riservato } from "@/lib/telematica/riservato";

describe("menu per utente (flag del super admin)", () => {
  const TELE = ["/telematica", "/telematica/mappa", "/telematica/mese"];
  it("le voci nascoste spariscono dal menu, le altre restano", () => {
    const tutte = menuPer("ADMIN").flatMap((g) => g.items.map((i) => i.href));
    const sue = menuPer("ADMIN", TELE).flatMap((g) => g.items.map((i) => i.href));
    expect(tutte).toEqual(expect.arrayContaining(TELE));
    expect(sue.filter((h) => h.startsWith("/telematica"))).toEqual([]);
    expect(sue).toContain("/portali"); expect(sue.length).toBe(tutte.length - 3);
  });
  it("le pagine nascoste e le loro chiamate non si aprono", () => {
    for (const p of ["/telematica", "/telematica/mappa", "/telematica/mese", "/api/telematica/posizioni", "/api/telematica/mese"]) expect(bloccato(p, TELE)).toBe(true);
    for (const p of ["/home", "/portali", "/presenze/verifica", "/account", "/"]) expect(bloccato(p, TELE)).toBe(false);
  });
  it("vale la voce più precisa: nascondere una sezione non nasconde la sua sorella", () => {
    expect(bloccato("/costi/gls", ["/costi"])).toBe(false); expect(bloccato("/costi/meta-mese", ["/costi"])).toBe(true);
    expect(bloccato("/telematica/mappa", ["/telematica"])).toBe(false);
  });
  it("se la pagina iniziale è nascosta si atterra altrove, mai in un giro a vuoto", () => {
    expect(paginaIniziale("ADMIN")).toBe("/home"); expect(paginaIniziale("ADMIN", ["/home"])).toBe("/dashboard");
    expect(paginaIniziale("STAGISTA", ["/training", "/vehicles"])).toBe("/account");
  });
  it("gli accessi alla telematica sono riservati", () => {
    expect(riservato("Targa Telematics")).toBe(true); expect(riservato("Flotta Web")).toBe(true); expect(riservato("Telepass")).toBe(false);
  });
});
