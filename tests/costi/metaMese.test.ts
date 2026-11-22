import { describe, it, expect } from "vitest";
import { leggiLavoratori, type Lavoratore } from "@/domain/presenze/lavoratori";
import { festiviAnno } from "@/domain/costi/festivi";
import { stationFromName } from "@/domain/presenze/regole";
import { costiOraBase, giorniDelMese, oreMetaStation, totaliMeta, vuote, type StimaMeta } from "@/domain/costi/metaMese";
import { excelMetaMese, nomeFoglioMeta } from "@/lib/costi/excelMetaMese";
import { files, grids, hasKit } from "./kit";

const TAR = [{ voce: "TRASFERTA", validaDal: "2026-01-01", valore: 22.5 }, { voce: "TRASFERTA_DOM_EXTRA", validaDal: "2025-05-01", valore: 7 }, { voce: "TRASFERTA_GLS", validaDal: "2026-01-01", valore: 25 }];
const lav = (contratto: string, giorni: Lavoratore["giorni"]): Lavoratore => ({ nome: "X", cf: "X", contratto, driverId: "", matricola: "", giorni } as Lavoratore);

describe("stima di metà mese", () => {
  it("giorni del mese giusti", () => {
    expect(giorniDelMese("2026-09")).toBe(30);
    expect(giorniDelMese("2026-10")).toBe(31);
    expect(giorniDelMese("2028-02")).toBe(29);
  });

  it("conta solo fino al giorno della stima; domenica e festivo al 50%", () => {
    const fest = festiviAnno(2026);
    // dicembre 2026: martedì 8 = Immacolata, domenica 6 e 13
    const g = { "2026-12-07": { Standard: 8 }, "2026-12-08": { Standard: 8 }, "2026-12-09": { Standard: 8, Straordinario: 1 }, "2026-12-13": { Standard: 6 }, "2026-12-20": { Standard: 6 } };
    const { ore, sestoFestivo } = oreMetaStation("DLO2", [lav("FT 39", g)], fest, TAR, { mese: "2026-12", finoA: "2026-12-13" });
    expect(ore.standard).toBe(16);
    expect(ore.magg50).toBe(14); // festivo 8 + domenica 6; il 20 è dopo il giorno della stima
    expect(ore.str30).toBe(1);
    expect(ore.trasfOrd).toBe(3); expect(ore.trasfDom).toBe(1);
    expect(sestoFestivo).toBe(0);
  });

  it("festivo lavorato come 6° giorno: al 65% (straordinario per il full time, supplementare per il part time)", () => {
    const fest = festiviAnno(2026);
    const sett = Object.fromEntries(["07", "08", "09", "10", "11", "12"].map((d) => [`2026-12-${d}`, { Standard: 6 }]));
    const ft = oreMetaStation("DLO2", [lav("FT 39", sett)], fest, TAR, { mese: "2026-12", finoA: "2026-12-31" });
    expect(ft.ore.magg50).toBe(0); expect(ft.ore.str65).toBe(6); expect(ft.ore.standard).toBe(30); expect(ft.sestoFestivo).toBe(6);
    const pt = oreMetaStation("DLO2", [lav("PT 24 ore", sett)], fest, TAR, { mese: "2026-12", finoA: "2026-12-31" });
    expect(pt.ore.supp65).toBe(6); expect(pt.ore.str65).toBe(0);
  });

  it("totali e proiezione come le formule del foglio", () => {
    const costi = costiOraBase(TAR, "2026-10-01");
    expect(costi.trasfOrd).toBe(22.5); expect(costi.trasfDom).toBe(29.5); expect(costi.trasfGls).toBe(25);
    const s: StimaMeta = { mese: "2026-10", giorno: 25, giorniMese: 31, costi, sic: { DER1: { ...vuote(), standard: 1000, magg50: 100, trasfOrd: 10 } }, std: { DER1: { ...vuote(), standard: 100, str30: 10 } }, glsSic: { ...vuote(), standard: 10, trasfOrd: 2 }, glsStd: { ...vuote(), standard: 5 } };
    const t = totaliMeta(s);
    expect(t.sic.alGiorno).toBe(100 * 28.56 + 10 * 22.5); // lo Standard dei dipendenti non entra
    expect(t.std.alGiorno).toBe(100 * 20.88 + 10 * 20.11);
    expect(t.gls.alGiorno).toBe(15 * 20.88 + 2 * 25); // dipendenti + somministrati
    expect(t.std.mese).toBeCloseTo((t.std.alGiorno / 25) * 31, 1);
    expect(t.std.quattroTerzi).toBeCloseTo((t.std.mese / 3) * 4, 1);
    const ws = excelMetaMese(s).getWorksheet(nomeFoglioMeta("2026-10"))!;
    expect(ws.name).toBe("Ott_26");
    expect(ws.getCell("B1").value).toBe(25); expect(ws.getCell("C1").value).toBe(31);
    expect(ws.getCell("E3").value).toBe(1000); expect(ws.getCell("E18").value).toBe(100); expect(ws.getCell("M18").value).toBe(5);
    expect((ws.getCell("C15").value as { formula: string }).formula).toBe("SUM(C4:C10)");
    expect((ws.getCell("N35").value as { formula: string }).formula).toBe("SUM(M9:M10,M24:M25)");
    expect((ws.getCell("N27").value as { formula: string }).formula).toBe("N15+N26");
  });
});

// ore di ottobre 2026 fino al 25, come nel foglio Ott_26 compilato a mano
describe.skipIf(!hasKit)("stima di metà mese sui tracking di ottobre 2026", () => {
  const fest = festiviAnno(2026);
  const calcola = async (dir: string, st: string) => {
    const f = files(dir).find((x) => stationFromName(x.split("/").pop()!) === st)!;
    const { lavoratori } = leggiLavoratori(await grids(f), 2026, 10, true);
    const o = oreMetaStation(st, lavoratori, fest, TAR, { mese: "2026-10", finoA: "2026-10-25", dispatcherTrasferta: !dir.endsWith("sic") }).ore;
    return [o.standard, o.magg50, o.supp18, o.supp65, o.str30, o.str65, o.trasfOrd, o.trasfDom];
  };
  it("STD DLO4 uguale al foglio", async () => { expect(await calcola("ott26/std", "DLO4")).toEqual([3154.9, 469.6, 178.4, 0, 51.4, 32, 421, 63]); });
  it("SIC DER1: ore uguali al foglio", async () => { expect((await calcola("ott26/sic", "DER1")).slice(0, 6)).toEqual([4201, 192, 189, 8, 11, 104]); });
});
