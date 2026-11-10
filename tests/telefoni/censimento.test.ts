import { describe, expect, it } from "vitest";
import { abbina, leggiWind, normIccid, normImei, normNumero, rangoFoglio, righeLocali } from "@/domain/telefoni/censimento";

describe("telefoni e SIM", () => {
  it("normalizza numero, IMEI e ICCID", () => {
    expect(normNumero(3330000002)).toBe("3330000002");
    expect(normNumero("+39 333 000 0002")).toBe("3330000002");
    expect(normImei("'350000000000002     ")).toBe("350000000000002");
    expect(normIccid("8939000000000000002")).toBe("8939000000000000002");
    expect(normIccid(8.939880845128975e18)).toBeNull(); // virgola mobile: cifre perse
  });
  it("legge il file Wind", () => {
    const w = leggiWind(
      [["Contratto", "Stato", "Data Attivazione", "Service ID", "Piano Tariffario", "ID CdF NRC"], [1000000000001, "Attivo", new Date("2018-10-04"), 3330000003, "Smart Share Unlimited", 100000000]],
      [["Contratto", "Stato", "Data Attivazione", "Service ID", "ID CdF NRC"], [1000000000002, "Attivo", new Date("2025-10-28"), 350000000000003, 100000000]],
    );
    expect(w.sim[0]).toMatchObject({ numero: "3330000003", stato: "Attivo", attivazione: "2018-10-04", piano: "Smart Share Unlimited" });
    expect(w.terminali[0].imei).toBe("350000000000003");
  });
  it("legge un foglio di station con PIN/PUK anche nelle note e nella colonna unica", () => {
    const r = righeLocali("DLO5_GESTIONE_BYOD.xlsm", "ARCHIVIO", [
      ["Station", "TAG BYOD", "Modello", "IMEI", "ICCID SIM", "NUMERO DI TELEFONO", "PIN ", "PUK", "NOMINATIVO ASSEGNATARIO", "STATUS", "NOTE"],
      ["DLO5", "T001A", "Samsung A14", "350000000000001", "8939000000000000001", 3330000001, "0000", null, "MARIO ROSSI", "ASSEGNATO", "PUK12345678"],
    ]);
    expect(r[0]).toMatchObject({ station: "DLO5", tag: "T001A", numero: "3330000001", imei: "350000000000001", pin: "0000", puk: "12345678", stato: "ASSEGNATO" });
    const pp = righeLocali("planning_DEVICE.xlsx", "Database_Byod", [["Station", "TAG BYOD", "IMEI", "ICCID SIM", "NUMERO DI TELEFONO", "PIN/PUK"], ["DER2", "S1", "350000000000001", "8939000000000000001", 3330000001, "1234/12345678"]]);
    expect([pp[0].pin, pp[0].puk]).toEqual(["1234", "12345678"]);
  });
  it("i file di station vincono sui riepiloghi; restituiti in fondo", () => {
    expect(rangoFoglio("DLO5_GESTIONE_BYOD.xlsm", "ARCHIVIO")).toBe(0);
    expect(rangoFoglio("QUERY_BYOD.xlsx", "DLO5")).toBe(1);
    expect(rangoFoglio("QUERY_BYOD.xlsx", "Byod_ALLDS")).toBe(2);
    expect(rangoFoglio("planning_DEVICE.xlsx", "RESTITUITI")).toBe(4);
  });
  it("abbina SIM per numero (anche via ICCID) e telefoni per IMEI", () => {
    const wind = { sim: [{ numero: "3330000001", contratto: "1", stato: "Attivo", attivazione: null, piano: "SUPER Unlimited", cdf: "x" }, { numero: "3200000000", contratto: "1", stato: "Attivo", attivazione: null, piano: "", cdf: "x" }], terminali: [{ imei: "350000000000001", contratto: "2", stato: "Attivo", attivazione: null, cdf: "x" }] };
    const loc = [
      { fonte: "a", station: "DLO5", tag: "T001A", modello: "A14", imei: "350000000000001", iccid: "8939000000000000001", numero: "3330000001", assegnatario: "MARIO ROSSI", stato: "ASSEGNATO", pin: null, puk: null, note: null },
      { fonte: "b", station: null, tag: null, modello: null, imei: null, iccid: "8939000000000000001", numero: null, assegnatario: null, stato: null, pin: "9999", puk: "87654321", note: null },
      { fonte: "c", station: "DER1", tag: "X", modello: null, imei: null, iccid: null, numero: "3399999999", assegnatario: null, stato: "RESTITUITO", pin: null, puk: null, note: null },
    ];
    const a = abbina(wind, loc);
    expect(a.sim.find((s) => s.numero === "3330000001")).toMatchObject({ inWind: true, station: "DLO5", pin: "9999", puk: "87654321", stato: "ASSEGNATO" });
    expect(a.riepilogo).toMatchObject({ simWind: 2, simWindTrovate: 1, simWindSenzaCensimento: 1, simSoloCensimento: 1, telWind: 1, telWindTrovati: 1 });
    expect(a.telefoni[0]).toMatchObject({ imei: "350000000000001", inWind: true, tag: "T001A", numero: "3330000001" });
  });
});

import { situazione } from "@/domain/telefoni/censimento";
describe("situazione normalizzata", () => {
  it("stati e note particolari = dismesso; il resto attivo", () => {
    expect(situazione("ASSEGNATO", null)).toBe("ASSEGNATO");
    expect(situazione("ROTAZIONE", "NO KASKO")).toBe("ROTAZIONE");
    expect(situazione("ROTTO IN ATTESA DI SOSTITUZIONE", null)).toBe("DISMESSO");
    expect(situazione("SPEDITO IL 13/07/2022", null)).toBe("DISMESSO");
    expect(situazione("RESTITUITO", null)).toBe("DISMESSO");
    expect(situazione("SMARRITO", null)).toBe("DISMESSO");
    expect(situazione(null, "Dismesso non funziona (non si accende)")).toBe("DISMESSO");
    expect(situazione(null, "sim da chiudere")).toBe("DISMESSO");
    expect(situazione("ASSEGNATO", "Vetro rotto ma funzionante")).toBe("ASSEGNATO");
    expect(situazione("BACKUP NO SIM", null)).toBe("SCORTA");
    expect(situazione(null, "SCATOLA 4")).toBe("SCORTA");
    expect(situazione("SCORTA DVN1", null)).toBe("SCORTA");
    expect(situazione(null, null)).toBe("ATTIVO");
    expect(situazione("ATTIVO", "NO KASKO")).toBe("ATTIVO");
    expect(situazione(null, null, "MARIO ROSSI")).toBe("ASSEGNATO");
    expect(situazione(null, null, "ROTAZIONE")).toBe("ROTAZIONE");
    expect(situazione(null, null, "UFFICIO DER1")).toBe("SCORTA");
  });
});
