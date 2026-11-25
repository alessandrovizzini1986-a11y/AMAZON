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

import { fusoRoma, giorniDelMese, giornoDaFlottaweb, giornoDaTarga, intervalloRoma, riepilogoMese, type RigaGiorno } from "@/domain/telematica";
import { ultimoPuntoFw } from "@/lib/telematica/posizioni";

describe("telematica: giorno e mese", () => {
  const seg = (reportType: string, dateBegin: string, dateEnd: string, mileage: number, extra = {}) => ({ reportType, dateBegin, dateEnd, mileage, formattedAddressBegin: "Via A", formattedAddressEnd: "Via B", positions: [], ...extra });
  it("Targa: km, orari, soste in mezzo alla giornata e rifornimenti", () => {
    const g = giornoDaTarga({
      totalMileage: 63.017, dateUsageBegin: "2026-11-23T09:41:45.000+01:00", dateUsageEnd: "2026-11-23T18:03:59.000+01:00", totalDriveTime: 14635, totalEngineOnTime: 17090, totalParkEngineOnTime: 2455, dailyMaximumSpeed: 133, drivingScore: { safety: { score: 5.9 } },
      usageSegments: [seg("INACTIVITY", "2026-11-23T00:00:00+01:00", "2026-11-23T09:41:45+01:00", 0), seg("USAGE", "2026-11-23T09:41:45+01:00", "2026-11-23T11:00:00+01:00", 30, { positions: [{ mileage: 14230, refuel: { refueledLiters: 41.5 }, location: { timestamp: "2026-11-23T10:15:00+01:00", formattedAddress: "Via Emilia, 10, Rimini, Rn", lat: 44.0612345678, lng: 12.5654321 } }] }),
        seg("INACTIVITY", "2026-11-23T11:00:00+01:00", "2026-11-23T11:20:00+01:00", 0), seg("USAGE", "2026-11-23T11:20:00+01:00", "2026-11-23T18:03:59+01:00", 33, { positions: [{ mileage: 14265.9, refuel: null }] }), seg("INACTIVITY", "2026-11-23T18:03:59+01:00", "2026-11-23T23:59:59+01:00", 0)],
    });
    expect(g).toMatchObject({ km: 63, guidaSec: 14635, fermoMotoreAccSec: 2455, velMax: 133, soste: 1, rifornimenti: 1, litri: 41.5, kmContatore: 14265.9 });
    expect(g.rifDett).toEqual([{ ora: "10:15", litri: 41.5, dove: "Via Emilia, 10, Rimini, Rn", lat: 44.061235, lng: 12.565432 }]);
    expect(g.tappe).toHaveLength(5); expect(g.tappe[1]).toEqual({ t: "G", da: "09:41", a: "11:00", km: 30, dove: "Via B" });
  });
  it("Targa: rifornimento senza coordinate → lat e lng null, ma le chiavi ci sono sempre (formato nuovo)", () => {
    const g = giornoDaTarga({ totalMileage: 10, usageSegments: [seg("USAGE", "2026-11-23T09:00:00+01:00", "2026-11-23T10:00:00+01:00", 10, { positions: [
      { refuel: { refueledLiters: 30 }, location: { timestamp: "2026-11-23T09:30:00+01:00", formattedAddress: null } },
      { refuel: { refueledLiters: 12 }, location: { timestamp: "2026-11-23T09:50:00+01:00", lat: 0, lng: 0 } },
      { refuel: { refueledLiters: 8 }, location: null },
    ] })] });
    expect(g.rifDett).toEqual([{ ora: "09:30", litri: 30, dove: null, lat: null, lng: null }, { ora: "09:50", litri: 12, dove: null, lat: null, lng: null }, { ora: "", litri: 8, dove: null, lat: null, lng: null }]);
    expect(g.rifDett.every((r) => "lat" in r && "lng" in r)).toBe(true);
    expect(JSON.parse(JSON.stringify(g.rifDett))[0]).toHaveProperty("lat", null);
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
  it("cambio dell'ora: lo scarto vale all'ora chiesta, non a mezzogiorno", () => {
    // 29/03/2026: alle 02:00 si passa all'ora legale; 25/10/2026: alle 03:00 si torna all'ora solare
    expect([fusoRoma("2026-03-29", "00:00:00"), fusoRoma("2026-03-29", "23:59:59")]).toEqual(["+01:00", "+02:00"]);
    expect([fusoRoma("2026-10-25", "00:00:00"), fusoRoma("2026-10-25", "23:59:59")]).toEqual(["+02:00", "+01:00"]);
    expect([fusoRoma("2026-03-28", "23:59:59"), fusoRoma("2026-10-26", "00:00:00")]).toEqual(["+01:00", "+01:00"]);
    expect(fusoRoma("2026-07-10", "00:00:00")).toBe("+02:00");
  });
  it("Targa: la giornata chiesta dura 23 ore il 29/03 e 25 ore il 25/10, senza ore del giorno prima o dopo", () => {
    const ore = (g: string) => { const { begin, end } = intervalloRoma(g); return (Date.parse(end) + 1 - Date.parse(begin)) / 3_600_000; };
    expect(intervalloRoma("2026-03-29")).toEqual({ begin: "2026-03-29T00:00:00.000+01:00", end: "2026-03-29T23:59:59.999+02:00" });
    expect(intervalloRoma("2026-10-25")).toEqual({ begin: "2026-10-25T00:00:00.000+02:00", end: "2026-10-25T23:59:59.999+01:00" });
    expect([ore("2026-03-29"), ore("2026-10-25"), ore("2026-11-23"), ore("2026-07-10")]).toEqual([23, 25, 24, 24]);
    // l'inizio è la mezzanotte italiana: 22:00 UTC del giorno prima d'estate, 23:00 UTC d'inverno
    expect(new Date(intervalloRoma("2026-10-25").begin).toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(new Date(intervalloRoma("2026-03-29").begin).toISOString()).toBe("2026-03-28T23:00:00.000Z");
  });
  it("Targa: con il giorno, le posizioni di un altro giorno italiano si scartano", () => {
    const pos = (timestamp: string, litri: number, mileage: number) => ({ mileage, refuel: { refueledLiters: litri }, location: { timestamp, lat: 44.06, lng: 12.56 } });
    const risposta = (positions: unknown[]) => ({ totalMileage: 50, usageSegments: [seg("USAGE", "2026-10-25T00:00:00+02:00", "2026-10-25T23:59:59+01:00", 50, { positions })] });
    // 25/10: l'ora 00:00–00:59 (ancora ora legale) è del giorno; le 23:30 del 24 e le 00:10 del 26 no
    const ott = risposta([pos("2026-10-24T23:30:00+02:00", 20, 1000), pos("2026-10-25T00:30:00+02:00", 30, 1010), pos("2026-10-25T23:30:00+01:00", 10, 1050), pos("2026-10-26T00:10:00+01:00", 5, 1060)]);
    const g = giornoDaTarga(ott, "2026-10-25");
    expect(g).toMatchObject({ rifornimenti: 2, litri: 40, kmContatore: 1050 });
    expect(g.rifDett.map((r) => r.ora)).toEqual(["00:30", "23:30"]);
    expect(giornoDaTarga(ott).rifornimenti).toBe(4); // senza il giorno: come prima, tutto
    // 29/03: le 23:30 del 28 (ora solare) non entrano; le 00:10 e le 23:50 del 29 sì
    const mar = risposta([pos("2026-03-28T23:30:00+01:00", 20, 900), pos("2026-03-29T00:10:00+01:00", 30, 910), pos("2026-03-29T23:50:00+02:00", 10, 950)]);
    expect(giornoDaTarga(mar, "2026-03-29")).toMatchObject({ rifornimenti: 2, litri: 40, kmContatore: 950 });
    // posizioni senza ora: non si possono attribuire a un altro giorno, restano
    expect(giornoDaTarga(risposta([{ refuel: { refueledLiters: 8 }, location: null }]), "2026-10-25").rifornimenti).toBe(1);
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
  const TELE = ["/telematica", "/telematica/mappa", "/telematica/mese", "/telematica/giornata", "/telematica/carburante"];
  it("le voci nascoste spariscono dal menu, le altre restano", () => {
    const tutte = menuPer("ADMIN").flatMap((g) => g.items.map((i) => i.href));
    const sue = menuPer("ADMIN", TELE).flatMap((g) => g.items.map((i) => i.href));
    expect(tutte).toEqual(expect.arrayContaining(TELE));
    expect(sue.filter((h) => h.startsWith("/telematica"))).toEqual([]);
    expect(sue).toContain("/portali"); expect(sue.length).toBe(tutte.length - TELE.length);
  });
  it("le pagine nascoste e le loro chiamate non si aprono", () => {
    for (const p of ["/telematica", "/telematica/mappa", "/telematica/mese", "/telematica/giornata", "/api/telematica/posizioni", "/api/telematica/mese"]) expect(bloccato(p, TELE)).toBe(true);
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

import { avvisiMezzo, basi, giornataMezzo, luogo, tappeDelGiorno, type Tappa } from "@/domain/telematica";

describe("giornata di consegna", () => {
  const BASE = "Via Del Salice, 5, Santarcangelo Di Romagna, Rn, Emilia-rom…", CASA = "Via Roma, 27, Cesena, Fc, Emilia-romagna, Italia";
  const t = (tipo: "G" | "S", da: string, a: string, km: number, dove: string | null = null): Tappa => ({ t: tipo, da, a, km, dove });
  // come arrivano da Targa: le fermate sono "guide" da 0 km
  const giro: Tappa[] = [t("S", "00:00", "09:23", 0, BASE), t("G", "09:23", "09:32", 0.4, BASE), t("G", "09:32", "10:12", 0, BASE), t("G", "10:12", "13:08", 63.1, "Via A, 1, Cesena, Fc"), t("G", "13:08", "13:10", 0, "Via A, 1, Cesena, Fc"),
    t("G", "13:10", "18:09", 80, BASE), t("G", "18:09", "20:19", 0, BASE), t("G", "20:19", "20:51", 31.7, CASA), t("G", "20:51", "22:28", 0, CASA), t("S", "22:28", "23:59", 0, CASA)];
  it("le fermate da 0 km sono soste e i pezzi uguali si uniscono", () => {
    const x = tappeDelGiorno(giro);
    expect(x.map((y) => y.t).join("")).toBe("SGSGSGSGS");
    expect(x[x.length - 1]).toMatchObject({ t: "S", da: "20:51", a: "23:59" });
  });
  it("il posto senza civico e le basi della station", () => {
    expect(luogo(BASE)).toBe("Via Del Salice, Santarcangelo Di Romagna"); expect(luogo("Via Del Salice, 9, Santarcangelo Di Romagna, Rn")).toBe(luogo(BASE)); expect(luogo(null)).toBeNull();
    expect(basi([...Array(18).fill("A"), ...Array(3).fill("B"), "C"])).toEqual(["A", "B"]);
  });
  it("partenza, rientro, soste e ripartenza dopo il rientro", () => {
    const g = giornataMezzo(giro, [luogo(BASE)!]);
    expect(g).toMatchObject({ partenza: "09:23", rientro: "20:51", soste: 2, parteDa: luogo(BASE), finisceA: "Via Roma, Cesena", riparte: { ora: "20:19", km: 31.7 } });
    expect(g.sostaLunga).toMatchObject({ min: 130, da: "18:09" });
    const codici = avvisiMezzo({ km: 150, velMax: 146, fermoMotoreAccSec: 600 }, g, [luogo(BASE)!], 90).map((a) => a.codice);
    expect(codici).toEqual(["FUORI_BASE_SERA", "RIPARTE", "VELOCITA"]);
  });
  it("giro normale: nessun avviso; furgone fermo: nessun avviso", () => {
    const ok = [t("S", "00:00", "08:00", 0, BASE), t("G", "08:00", "12:00", 60, "Via B, Rimini"), t("G", "12:00", "12:20", 0, "Via B, Rimini"), t("G", "12:20", "16:00", 40, BASE), t("S", "16:00", "23:59", 0, BASE)];
    const g = giornataMezzo(ok, [luogo(BASE)!]);
    expect(avvisiMezzo({ km: 100, velMax: 110, fermoMotoreAccSec: 0 }, g, [luogo(BASE)!], 95)).toEqual([]);
    expect(g).toMatchObject({ soste: 1, sosteMin: 20, fuoriMin: 480 });
    expect(avvisiMezzo({ km: 0, velMax: null, fermoMotoreAccSec: 0 }, giornataMezzo([t("S", "00:00", "23:59", 0, CASA)], [luogo(BASE)!]), [luogo(BASE)!], 95)).toEqual([]);
  });
});

describe("posti conosciuti", () => {
  const BASE = "Via Del Salice, Santarcangelo Di Romagna", OFF = "Via Pietà, Savignano Sul Rubicone", PARK = "Via Padre Tosi, Santarcangelo Di Romagna";
  const giro = (sera: string): Tappa[] => [{ t: "S", da: "00:00", a: "09:00", km: 0, dove: `Via Del Salice, 5, Santarcangelo Di Romagna, Rn` }, { t: "G", da: "09:00", a: "17:00", km: 90, dove: sera }, { t: "S", da: "17:00", a: "23:59", km: 0, dove: sera }];
  const x = { km: 90, velMax: 100, fermoMotoreAccSec: 0 };
  it("in officina non è un'anomalia ma si vede; in un parcheggio non si segnala; altrove sì", () => {
    expect(avvisiMezzo(x, giornataMezzo(giro("Via Pietà, 30, Savignano Sul Rubicone, Fc"), [BASE]), [BASE], 90, [OFF])).toEqual([{ codice: "OFFICINA", testo: `La sera è in officina (${OFF})`, info: true }]);
    expect(avvisiMezzo(x, giornataMezzo(giro("Via Padre Tosi, 3, Santarcangelo Di Romagna, Rn"), [BASE, PARK]), [BASE, PARK], 90, [OFF])).toEqual([]);
    expect(avvisiMezzo(x, giornataMezzo(giro("Via Roma, 1, Cesena, Fc"), [BASE, PARK]), [BASE, PARK], 90, [OFF]).map((a) => a.codice)).toEqual(["FUORI_BASE_SERA"]);
    const casa = avvisiMezzo(x, giornataMezzo(giro("Via Roma, 1, Cesena, Fc"), [BASE]), [BASE], 90, [OFF], { "Via Roma, Cesena": "Rossi" });
    expect(casa).toEqual([{ codice: "CASA_DRIVER", testo: "La sera è a casa di un driver (Rossi): Via Roma, Cesena" }]);
  });
});

import { SOLO_SUPER, tutteLeVoci, voceDi, vociDelRuolo } from "@/components/navModel";

describe("statistica d'uso", () => {
  it("ogni pagina è contata sotto la sua voce di menu", () => {
    expect(voceDi("/presenze/verifica")).toBe("/presenze"); expect(voceDi("/costi/gls")).toBe("/costi/gls"); expect(voceDi("/costi/meta-mese?x=1")).toBe("/costi");
    expect(voceDi("/telematica/giornata")).toBe("/telematica/giornata"); expect(voceDi("/account")).toBe("altro:/account"); expect(voceDi("/")).toBe("altro:/");
  });
  it("la pagina dell'uso è solo del super admin: non è tra i flag e agli altri è bloccata", () => {
    expect(SOLO_SUPER).toContain("/uso");
    expect(vociDelRuolo("ADMIN").flatMap((g) => g.items.map((i) => i.href))).not.toContain("/uso");
    expect(bloccato("/uso", SOLO_SUPER)).toBe(true); expect(bloccato("/api/uso", SOLO_SUPER)).toBe(true);
    expect(tutteLeVoci().some((v) => v.href === "/uso")).toBe(true);
  });
});
