import { describe, it, expect } from "vitest";
import { csv, numIt } from "../fatture/fix";
import { calibra, finestra, type RigaCalibrazione } from "@/domain/forecast/tariffe";
import { classeForecast, lineaDaNome, type RegolaMappa } from "@/domain/forecast/mappa";
import { confronta, prevedi, reale, ultimoForecast } from "@/domain/forecast/previsione";
import { inizioSettimana } from "@/domain/forecast/settimane";

const righe = (f: string): RigaCalibrazione[] => csv("forecast", f).map((r) => ({ ds: r.DS, data: r.Data, classe: r.classe, quantita: Number(r["Quantità"]), avere: numIt(r.AVERE) }));
const regole: RegolaMappa[] = [...csv("forecast", "mappa_forecast_classe.csv").map((r) => ({ serviceType: r.service_type_scheduling, cycle: r.cycle, station: "*", classe: r.classe })), { serviceType: "Sameday Parcel", cycle: "*", station: "DLO5", classe: "SD_B" }];

describe("§7.1 mappa forecast → classe", () => {
  it("regole del kit, eccezione DLO5, non mappato", () => {
    expect(classeForecast("Standard Parcel - 6.4H", "CYCLE_1", "DER1", regole)).toBe("ND_STANDARD");
    expect(classeForecast("Sameday Parcel", "CYCLE_SD_A", "DLO2", regole)).toBe("SD_A");
    expect(classeForecast("Sameday Parcel", "CYCLE_SD_B", "DLO2", regole)).toBe("SD_C");
    expect(classeForecast("Sameday Parcel", "CYCLE_SD_A", "DLO5", regole)).toBe("SD_B");
    expect(classeForecast("Multi-Use", "CYCLE_SD_C", "DVN1", regole)).toBe("SD_B");
    expect(classeForecast("Nuovo servizio", "X", "DER1", regole)).toBe("NON_MAPPATO");
    expect([lineaDaNome("PROF_44_next.xlsx"), lineaDaNome("PROF_43_same.xlsx"), lineaDaNome("forecast.xlsx")]).toEqual(["ND", "SD", null]);
  });
});

describe("§8.4 tariffe dalle settimane 36–40", () => {
  const cal = righe("righe_settimane_36_40.csv");
  const fin = finestra(cal, 5, "2026-12-31");
  const c = calibra(cal, fin);
  it("finestra: 5 settimane per DS", () => {
    expect(Object.values(fin).every((w) => w.length === 5)).toBe(true);
    expect(fin.DLO2).toEqual(["2026-08-30", "2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27"]);
  });
  it("tariffe = atteso_tariffe_36_40.csv (±0,01)", () => {
    const att = csv("forecast", "atteso_tariffe_36_40.csv");
    expect(c.tariffe.length).toBe(att.length);
    for (const a of att) {
      const t = c.tariffe.find((x) => x.ds === a.DS && x.classe === a.classe)!;
      expect([a.DS, a.classe, t.rotte, Math.abs(t.tariffa - numIt(a.tariffa_rotta)) <= 0.01]).toEqual([a.DS, a.classe, Number(a.rotte), true]);
    }
  });
  it("extra per rotta = atteso_extra_per_rotta_36_40.csv (±0,001)", () => {
    const att = csv("forecast", "atteso_extra_per_rotta_36_40.csv");
    expect(c.extra.length).toBe(att.length);
    for (const a of att) {
      const e = c.extra.find((x) => x.ds === a.DS && x.classe === a.classe)!;
      expect([a.DS, a.classe, e.rotteTotali, Math.abs(e.euroPerRotta - numIt(a.euro_per_rotta)) <= 0.001]).toEqual([a.DS, a.classe, Number(a.rotte_totali_36_40), true]);
    }
  });
});

describe("§8.5 previsione settimana 41 (forecast PROF_40)", () => {
  const cal = righe("righe_settimane_36_40.csv");
  const c = calibra(cal, finestra(cal, 5, "2026-12-31"));
  const fc = csv("forecast", "PROF_40_settimana_41.csv").map((r) => ({ data: r.ofd_date, station: r.station, routes: Number(r.routes_output), classe: classeForecast(r.service_type_scheduling, r.cycle, r.station, regole) }));
  const p = prevedi(fc, c);
  const actual = righe("righe_actual_settimana_41.csv");
  const att = csv("forecast", "atteso_previsione_settimana_41.csv");
  it("previsto per DS = atteso (±1 €), con SD da media dove manca il forecast SD", () => {
    expect(p.map((x) => x.ds)).toEqual(att.map((a) => a.DS));
    for (const a of att) {
      const x = p.find((y) => y.ds === a.DS)!;
      expect(x.week).toBe(41);
      expect(x.rotteND).toBe(Number(a.rotte_ND_forecast));
      expect(x.rotteSD).toBeCloseTo(numIt(a.rotte_SD_media), 1);
      expect(x.sdDaMedia).toBe(numIt(a.rotte_SD_media) > 0);
      for (const [k, v] of [["previstoND", "previsto_ND"], ["previstoSD", "previsto_SD"], ["previstoExtra", "previsto_extra"], ["totale", "previsto_totale"]] as const)
        expect(Math.abs(x[k] - numIt(a[v])), `${a.DS} ${k}`).toBeLessThanOrEqual(1);
    }
  });
  it("actual_totale ricalcolato dalle righe della settimana 41 coincide, errore % come atteso", () => {
    const sett = inizioSettimana("2026-10-04");
    for (const a of att) expect(reale(actual, a.DS, sett)!.avere, a.DS).toBeCloseTo(numIt(a.actual_totale), 2);
    const b = confronta(p, actual);
    for (const a of att) expect(b.find((x) => x.ds === a.DS)!.erroreTot, a.DS).toBeCloseTo(numIt(a.errore_pct), 0);
    const tot = (b.reduce((s, x) => s + x.previsto, 0) - b.reduce((s, x) => s + x.reale, 0)) / b.reduce((s, x) => s + x.reale, 0);
    expect(Math.round(tot * 1000) / 10).toBe(-0.9); // S11: errore totale ≈ −0,9 %
  });
  it("ripartizione nei mesi: la somma dei giorni = totale della settimana", () => {
    for (const x of p) expect(Object.values(x.perGiorno).reduce((s, v) => s + v, 0)).toBeCloseTo(x.totale, 1);
  });
});

describe("§1 per (station, data, classe) vale l'ultimo file", () => {
  it("il file più recente sostituisce le righe di quello vecchio, il resto resta", () => {
    const r = ultimoForecast([
      { data: "2026-11-01", station: "DER1", classe: "ND_STANDARD", routes: 10, fileId: "a", caricatoIl: "2026-11-01T10:00:00Z" },
      { data: "2026-11-01", station: "DER1", classe: "ND_STANDARD", routes: 12, fileId: "b", caricatoIl: "2026-11-02T10:00:00Z" },
      { data: "2026-11-02", station: "DER1", classe: "ND_STANDARD", routes: 9, fileId: "a", caricatoIl: "2026-11-01T10:00:00Z" },
    ]);
    expect(r.map((x) => x.routes)).toEqual([12, 9]);
  });
});

describe("settimane con solo forecast SD", () => {
  it("segnate come parziali ed escluse dai mesi", async () => {
    const { prevedi, perMese } = await import("@/domain/forecast/previsione");
    const cal = { settimane: {}, tariffe: [{ ds: "DLO2", classe: "SD_A", rotte: 10, avere: 2000, tariffa: 200 }], extra: [], extraPerRotta: {}, nonPreviste: [], sdMedia: {}, mediaClasse: {} };
    const p = prevedi([{ data: "2027-01-04", station: "DLO2", classe: "SD_A", routes: 5 }], cal);
    expect(p[0]).toMatchObject({ soloSD: true, totale: 1000 });
    expect(perMese(p)).toEqual({});
  });
});
