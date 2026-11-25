import { describe, expect, it } from "vitest";
import { tabellaTassi, tasso, analisi, indicatori, livelloDi, mesiAnomali, mesiValidi, riepilogo, rischio, somma, type RigaMese } from "@/domain/personale/analisi";

const r = (mese: string, station: string, gruppo: "SIC" | "STD", teste: number, mal: number, inf: number, ass: number, rotte = 1000, calendario = true): RigaMese =>
  ({ mese, station, gruppo, teste, calendario, rotte, rotteTd: 0, ggLavorati: rotte, ggMalattia: mal, ggInfortunio: inf, persMalattia: ass, persInfortunio: 0, persAssenti: ass });

describe("assenze del personale", () => {
  it("indicatori: per 100 lavoratori, per 1.000 rotte, e i mesi senza calendario non contano", () => {
    const s = somma([r("2026-02", "A", "SIC", 50, 40, 10, 10, 800), r("2026-03", "A", "SIC", 50, 60, 0, 15, 1200), r("2026-01", "A", "STD", 30, 0, 0, 0, 500, false)]);
    expect(s).toMatchObject({ teste: 100, mesi: 2, rotte: 2000, ggMalattia: 100, ggInfortunio: 10, persAssenti: 25 });
    expect(indicatori(s)).toEqual({ headcount: 50, assentiPct: 25, malattia100: 100, infortunio100: 10, infortunio1000Rotte: 5, giorniPersi: 110 });
  });
  it("rischio: uguale al network vale 50, il doppio 100 (con tetto), e dice chi traina", () => {
    const net = { headcount: 100, assentiPct: 20, malattia100: 80, infortunio100: 10, infortunio1000Rotte: 5, giorniPersi: 0 };
    expect(rischio(net, net).punti).toBe(50);
    const x = rischio({ ...net, assentiPct: 10, malattia100: 80, infortunio100: 50 }, net);
    expect(x.parti).toEqual({ assenti: 25, malattia: 50, infortunio: 100 }); expect(x.punti).toBe(55); expect(x.traino).toBe("infortunio");
    expect([0, 30, 31, 60, 61, 80, 81, 100].map(livelloDi)).toEqual(["OK", "OK", "ATTENZIONE", "ATTENZIONE", "CRITICA", "CRITICA", "PRIORITARIA", "PRIORITARIA"]);
  });
  const dati = ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"].flatMap((m, i) => [
    r(m, "GRANDE", "SIC", 100, 150 + (i >= 3 ? 80 : 0), 30, 35), r(m, "GRANDE", "STD", 40, 20, 0, 5),
    r(m, "PICCOLA", "SIC", 20, 10, 0, 2), r(m, "PICCOLA", "STD", 10, 5, 0, 1),
    r(m, "MEDIA", "SIC", 50, 50, 5, 10), r(m, "MEDIA", "STD", 30, 20, 2, 5),
  ]);
  it("vista Totale: solo i mesi con tutti e due i gruppi", () => {
    expect(mesiValidi([...dati, r("2026-01", "GRANDE", "SIC", 100, 1, 1, 1)], "TOTALE")).toEqual(["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]);
    expect(mesiValidi([...dati, r("2026-01", "GRANDE", "SIC", 100, 1, 1, 1)], "SIC")[0]).toBe("2026-01");
  });
  it("priorità: la station grande e rischiosa è prima, quella che pesa di più vale 100, le quote sommano a 100", () => {
    const a = analisi(dati, "TOTALE", mesiValidi(dati, "TOTALE"));
    expect(a.stations.map((s) => s.station)).toEqual(["GRANDE", "MEDIA", "PICCOLA"]);
    expect(a.stations[0]).toMatchObject({ peso: 100, quadrante: "PRIORITA_ASSOLUTA" });
    expect(a.stations[0].tendenza?.verso).toBe("PEGGIORA");
    expect(Math.round(a.stations.reduce((x, s) => x + s.quotaGiorni, 0))).toBe(100);
    expect(a.stations[0].priorita).toBe(Math.round(a.stations[0].rischio * 0.6 + 100 * 0.4));
    expect(a.stations[2].quadrante).toBe("STABILE");
  });
  it("riepilogo: al massimo 8 frasi, la prima dice dove intervenire", () => {
    const mesi = mesiValidi(dati, "TOTALE"), f = riepilogo(analisi(dati, "TOTALE", mesi), dati, "TOTALE", mesi);
    expect(f.length).toBeLessThanOrEqual(8); expect(f[0].testo).toContain("Dove intervenire per primo: GRANDE");
    expect(f.some((x) => x.testo.startsWith("SIC contro STD"))).toBe(true); expect(f.some((x) => x.testo.includes("In peggioramento"))).toBe(true);
  });
  it("tasso di assenteismo: malattia e infortunio sui giorni dovuti, e le due parti sommano al totale", () => {
    const t = tasso([r("2026-02", "A", "SIC", 50, 60, 20, 10, 920), r("2026-01", "A", "STD", 30, 99, 99, 0, 500, false)]);
    expect(t).toEqual({ lavorati: 920, malattia: 60, infortunio: 20, pct: 8, malattiaPct: 6, infortunioPct: 2 });
    expect(tasso([]).pct).toBeNull();
    const tab = tabellaTassi([r("2026-02", "A", "SIC", 50, 60, 20, 10, 920), r("2026-02", "A", "STD", 20, 0, 0, 0, 500), r("2026-03", "A", "SIC", 50, 100, 0, 10, 900), r("2026-02", "B", "SIC", 10, 0, 0, 0, 100), r("2026-02", "B", "STD", 10, 0, 0, 0, 100)], "TOTALE");
    expect(tab.mesi).toEqual(["2026-02"]); expect(tab.stations.map((x) => x.station)).toEqual(["A", "B"]);
    expect(tab.stations[0].ytd.pct).toBe(5.3); expect(tab.network.ytd.lavorati).toBe(1620);
    expect(tabellaTassi([r("2026-02", "A", "SIC", 50, 60, 20, 10, 920), r("2026-03", "A", "SIC", 50, 100, 0, 10, 900)], "SIC").stations[0].perMese.map((x) => x.pct)).toEqual([8, 10]);
  });
  it("mesi anomali: solo con almeno 6 mesi e un salto vero", () => {
    const base = [10, 11, 9, 10, 12, 10, 11].map((v, i) => ({ mese: `2026-0${i + 1}`, persi100: v }));
    expect(mesiAnomali(base)).toEqual([]);
    expect(mesiAnomali([...base, { mese: "2026-08", persi100: 60 }]).map((x) => x.mese)).toEqual(["2026-08"]);
    expect(mesiAnomali(base.slice(0, 4))).toEqual([]);
  });
});
