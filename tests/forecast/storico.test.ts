import { describe, it, expect } from "vitest";
import { giorni, precisione, rotteGiorno, settimane, simulaSwa, statoAlla, versioneFile, type RigaStorico } from "@/domain/forecast/storico";

const r = (fileId: string, data: string, classe: string, routes: number, cycle = "CYCLE_1", station = "DER1"): RigaStorico => ({ fileId, data, station, cycle, classe, routes });

describe("versione del file", () => {
  it("dal nome PROF_<wk>, risalendo dalla prima data; senza numero = settimana della prima data", () => {
    expect(versioneFile("PROF_44_next.xlsx", "2026-11-01")).toBe("2026-10-25"); // next: settimane 45–47, emesso in wk 44
    expect(versioneFile("PROF_43_same.xlsx", "2026-10-25")).toBe("2026-10-18");
    expect(versioneFile("PROF_40_next_forecast.xlsx", "2026-10-04")).toBe("2026-09-27");
    expect(versioneFile("forecast.xlsx", "2026-10-07")).toBe("2026-10-04");
  });
  it("file ricaricato dopo uno più nuovo: vince la versione, non il caricamento", () => {
    const files = [{ id: "nuovo", linea: "ND", versione: "2026-10-25", caricatoIl: "2026-10-26T08:00:00Z" }, { id: "vecchio", linea: "ND", versione: "2026-10-18", caricatoIl: "2026-10-30T08:00:00Z" }];
    const rs = [r("nuovo", "2026-11-02", "ND_STANDARD", 40), r("vecchio", "2026-11-02", "ND_STANDARD", 35)];
    expect(statoAlla(files, rs, "2026-12-31").map((x) => x.fileId)).toEqual(["nuovo"]);
    expect(statoAlla(files, rs, "2026-10-20").map((x) => x.fileId)).toEqual(["vecchio"]);
  });
});

describe("rotte e furgoni", () => {
  it("rotte del giorno = next + SD_A + max(SD_B, SD_C); furgoni = picco next (senza cargo bike) + picco max(A,B,C)", () => {
    const rs = [
      r("f", "2026-11-02", "ND_STANDARD", 38), r("f", "2026-11-02", "ND_CARGOBIKE", 3), r("f", "2026-11-02", "ND_SWA", 2, "SWA_PM"),
      r("f", "2026-11-02", "SD_A", 10, "CYCLE_SD_A"), r("f", "2026-11-02", "SD_C", 7, "CYCLE_SD_B"), r("f", "2026-11-02", "SD_C", 9, "CYCLE_SD_C"),
      r("f", "2026-11-03", "ND_STANDARD", 30), r("f", "2026-11-03", "SD_A", 4, "CYCLE_SD_A"), r("f", "2026-11-03", "SD_B", 12, "CYCLE_SD_C"),
    ];
    const g = giorni(rs);
    expect(rotteGiorno(g[0])).toBe(43 + 10 + 9);
    const [s] = settimane(g);
    expect([s.piccoND, s.piccoSD, s.furgoni, s.piccoStessoGiorno]).toEqual([40, 12, 52, 50]);
    expect(s.rotte).toBe(62 + 30 + 4 + 12);
  });
  it("SWA simulate dal file ND in uso: media per giorno della settimana, dal giorno dopo l'ultima SWA, settimana parziale", () => {
    const nd: RigaStorico[] = [];
    for (let d = "2026-11-01"; d <= "2026-11-17"; d = addG(d, 1)) { nd.push(r("n", d, "ND_STANDARD", 30)); nd.push(r("n", d, "ND_SWA", new Date(d + "T12:00:00Z").getUTCDay() === 1 ? (d === "2026-11-09" ? 5 : 2) : 3, "SWA_PM")); }
    const rs = [...nd, r("s", "2026-11-30", "SD_A", 6, "CYCLE_SD_A")];
    const sim = simulaSwa(giorni(rs), "2026-11-30", nd);
    expect(sim.righe[0].data).toBe("2026-11-18"); // il mercoledì dopo l'ultima SWA, non la domenica dopo
    expect(sim.righe.find((x) => x.data === "2026-11-18")!.routes).toBe(3); // mercoledì presente in 2 settimane: media su 2
    const lun = sim.giorni.find((g) => g.data === "2026-11-30")!;
    expect([lun.swaSimulate, lun.nd, lun.sdA]).toEqual([3, 3, 6]); // lunedì (2 + 5 + 2) / 3
    expect(settimane(sim.giorni).find((s) => s.settimana === "2026-11-29")).toMatchObject({ parziale: true, swaSimulate: 6 }); // dom 29 (3) + lun 30 (3)
  });
  it("nessuna SWA simulata se il file ND in uso non ne ha (anche se un file vecchio sì)", () => {
    const vecchio = [r("v", "2026-07-06", "ND_SWA", 4, "SWA_PM")];
    const nuovo = [r("n", "2026-11-02", "ND_STANDARD", 30)];
    expect(simulaSwa(giorni([...vecchio, ...nuovo]), "2026-11-14", nuovo).righe).toEqual([]);
  });
  it("una classe sparita nella versione nuova non sopravvive dal file vecchio", () => {
    const files = [{ id: "v40", linea: "ND", versione: "2026-09-27", caricatoIl: "x" }, { id: "v44", linea: "ND", versione: "2026-10-25", caricatoIl: "x" }];
    const rs = [r("v40", "2026-11-02", "ND_STANDARD", 40), r("v40", "2026-11-02", "ND_CARGOBIKE", 3), r("v44", "2026-11-02", "ND_STANDARD", 42)];
    expect(statoAlla(files, rs, "2026-12-31").map((x) => `${x.fileId} ${x.classe}`)).toEqual(["v44 ND_STANDARD"]);
  });
});

describe("precisione per anticipo", () => {
  it("errore medio per DS e sul totale, solo settimane chiuse", () => {
    const base = { rotte: 0, rotteND: 0, rotteSD: 0, furgoni: 0, piccoND: 0, piccoSD: 0, piccoStessoGiorno: 0, swaSimulate: 0, parziale: false, week: 41, eurND: 0, eurSD: 0, versioneWeek: 0 };
    const p = [
      { ...base, station: "DER1", settimana: "2026-10-04", versione: "2026-10-04", anticipo: 0, eur: 102 },
      { ...base, station: "DER1", settimana: "2026-10-04", versione: "2026-09-20", anticipo: 2, eur: 90 },
      { ...base, station: "DER2", settimana: "2026-10-04", versione: "2026-10-04", anticipo: 0, eur: 196 },
      { ...base, station: "DER1", settimana: "2026-11-29", versione: "2026-11-01", anticipo: 4, eur: 50 },
    ];
    const real: Record<string, number> = { DER1: 100, DER2: 200 };
    const out = precisione(p, (s) => real[s] ?? null, (w) => w < "2026-11-01");
    expect(out).toEqual([
      { station: "DER1", anticipo: 0, errore: 2, settimane: 1 }, { station: "DER1", anticipo: 2, errore: 10, settimane: 1 },
      { station: "DER2", anticipo: 0, errore: 2, settimane: 1 },
      { station: "TUTTE", anticipo: 0, errore: 0.7, settimane: 1 }, { station: "TUTTE", anticipo: 2, errore: 10, settimane: 1 },
    ]);
  });
});

describe("forecast del kit: PROF_40 next, PROF_43 same, PROF_44 next", async () => {
  const fs = await import("node:fs");
  const { workbookToGrids } = await import("@/lib/presenze/excelGrid");
  const { text } = await import("@/domain/presenze/grid");
  const { csv, fix, numIt } = await import("../fatture/fix");
  const { classeForecast } = await import("@/domain/forecast/mappa");
  const { calibra, finestra } = await import("@/domain/forecast/tariffe");
  const { prevedi, ultimoForecast } = await import("@/domain/forecast/previsione");
  const { storico, ultimaVersione, versioneFile } = await import("@/domain/forecast/storico");
  const regole = csv("forecast", "mappa_forecast_classe.csv").map((r) => ({ serviceType: r.service_type_scheduling, cycle: r.cycle, station: "*", classe: r.classe }));
  const leggi = async (nome: string, id: string) => {
    const ws = (await workbookToGrids(fs.readFileSync(fix("forecast", nome)))).find((s) => s.name === "PROF")!;
    const h = ws.rows[0].map((v) => text(v).trim()); const i = (c: string) => h.indexOf(c);
    return ws.rows.slice(1).filter((r) => r[i("ofd_date")]).map((r) => {
      const d = r[i("ofd_date")]; const data = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
      const cycle = text(r[i("cycle")]).trim(), st = text(r[i("station")]).trim();
      return { fileId: id, data, station: st, cycle, classe: classeForecast(text(r[i("service_type_scheduling")]).trim(), cycle, st, regole), routes: Math.round(Number(r[i("routes_output")]) || 0) };
    });
  };
  const nomi: [string, string, string][] = [["PROF_40_next_forecast.xlsx", "n40", "ND"], ["PROF_43_same.xlsx", "s43", "SD"], ["PROF_44_next.xlsx", "n44", "ND"]];
  const righe = (await Promise.all(nomi.map(([n, id]) => leggi(n, id)))).flat();
  const files = nomi.map(([n, id, linea]) => ({ id, linea, caricatoIl: id === "n40" ? "2026-11-03T10:00:00Z" : "2026-11-01T10:00:00Z", versione: versioneFile(n, righe.filter((r) => r.fileId === id).reduce((m, r) => (r.data < m ? r.data : m), "9999")) }));
  const cal = calibra(csv("forecast", "righe_settimane_36_40.csv").map((r) => ({ ds: r.DS, data: r.Data, classe: r.classe, quantita: Number(r["Quantità"]), avere: numIt(r.AVERE) })), finestra(csv("forecast", "righe_settimane_36_40.csv").map((r) => ({ ds: r.DS, data: r.Data, classe: r.classe, quantita: Number(r["Quantità"]), avere: numIt(r.AVERE) })), 5, "2026-12-31"));
  const punti = storico(files, righe, () => cal);
  const ult = ultimaVersione(punti);

  it("versioni wk 40 / 43 / 44; PROF_40 ricaricato per ultimo non scavalca PROF_44", () => {
    expect(files.map((f) => f.versione)).toEqual(["2026-09-27", "2026-10-18", "2026-10-25"]);
    const ord = new Map(files.map((f) => [f.id, `${f.versione}|${f.caricatoIl}`]));
    const fc = ultimoForecast(righe.map((r) => ({ data: r.data, station: r.station, classe: r.classe, routes: r.routes, fileId: r.fileId, caricatoIl: ord.get(r.fileId)! })));
    expect(new Set(fc.filter((r) => r.data >= "2026-11-01" && r.data <= "2026-11-21" && !r.classe.startsWith("SD")).map((r) => (r as { fileId: string }).fileId))).toEqual(new Set(["n44"]));
  });
  it("€ dell'ultima versione per le settimane 45–47 = prevedi sul forecast in uso (+ SWA che già ci sono)", () => {
    for (const w of ["2026-11-01", "2026-11-08", "2026-11-15"]) {
      const inUso = righe.filter((r) => (r.fileId === "n44" || r.fileId === "s43") && r.data >= w && r.data <= addG(w, 6)).map((r) => ({ data: r.data, station: r.station, classe: r.classe, routes: r.routes }));
      const attesi = Object.fromEntries(prevedi(inUso, cal).map((p) => [p.ds, p.totale]));
      for (const x of ult.filter((y) => y.settimana === w)) expect(Math.round(x.eur), `${x.station} ${w}`).toBe(Math.round(attesi[x.station] ?? 0));
    }
  });
  it("oltre wk 47 il next resta quello della versione 40; oltre la wk 52 solo same day (parziale); SWA simulate dove mancano", () => {
    const tra = ult.filter((x) => x.settimana > "2026-11-15" && x.settimana <= "2026-12-20");
    expect(tra.length).toBeGreaterThan(0);
    expect(tra.every((x) => !x.parziale && x.rotteND > 0)).toBe(true);
    const oltre = ult.filter((x) => x.settimana > "2026-12-26");
    expect(oltre.length).toBeGreaterThan(0);
    expect(oltre.every((x) => x.parziale)).toBe(true);
    const conSwa = new Set(righe.filter((r) => r.fileId === "n44" && r.classe === "ND_SWA").map((r) => r.station));
    for (const x of oltre.filter((y) => conSwa.has(y.station) && y.settimana <= "2027-01-10")) expect(x.swaSimulate, `${x.station} ${x.settimana}`).toBeGreaterThan(0);
    for (const x of ult.filter((y) => y.settimana === "2026-11-08")) expect(x.furgoni).toBe(x.piccoND + x.piccoSD);
  });
});
const addG = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
