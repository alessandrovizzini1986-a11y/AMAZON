import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import { leggiLavoratori } from "@/domain/presenze/lavoratori";
import { festiviAnno, festiviMese } from "@/domain/costi/festivi";
import { leggiAnagraficaCDL } from "@/domain/costi/anagrafica";
import { aggregaAdit, leggiAdit, tariffeDaAdit } from "@/domain/costi/adit";
import { oreStation, stimaStd } from "@/domain/costi/std";
import { bustaLavoratore, lavoratoriSic, sicLordo, type LavoratoreSic } from "@/domain/costi/sic";
import { excelStima } from "@/lib/costi/excelStima";
import { esempio, files, grids, hasKit } from "./kit";

const ST = ["DER1", "DER2", "DLO2", "DLO4", "DLO5", "DLZ2", "DVN1"];
const stationDi = (f: string) => ST.find((s) => f.toUpperCase().includes(s))!;
const TAR = [{ voce: "TRASFERTA", validaDal: "2026-01-01", valore: 22.5 }, { voce: "TRASFERTA_DOM_EXTRA", validaDal: "2025-05-01", valore: 7 }];
const PSIC = { MOLT_ONERI: 1.434, STR_FT: 17.9, STR_PT: 16.1, SUPP: 14.1, DOMFEST: 4.6, MALATTIA_H: -9.5, CARENZA_PCT: 0.025 };
const haSoffice = (() => { try { execFileSync("soffice", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } })();

describe.skipIf(!hasKit || !haSoffice)("Excel stima settembre (formule ricalcolate da LibreOffice)", () => {
  it("TOT STD e SIC lordo per station uguali ai golden", async () => {
    const fest = festiviAnno(2026);
    const aditAgo = leggiAdit(await grids(esempio("adit", "0826_Doc._emessi_ADIT_STD-SL_09.09.26.xlsx"))).righe;
    const t = tariffeDaAdit(aditAgo);
    const ag = aggregaAdit(aditAgo);
    const a = leggiAnagraficaCDL(await grids(esempio("anagrafica", "DB_CDL_base_0626_AmazonGLS_BO.xlsx")));
    const idx = new Map(a.righe.map((r) => [r.cf, r]));
    const oreStd = [], stimeStd = [], lav: LavoratoreSic[] = [];
    for (const f of files("tracking_std_set26")) {
      const st = stationDi(f);
      const o = oreStation(st, leggiLavoratori(await grids(f), 2026, 9).lavoratori, fest, TAR);
      oreStd.push(o); stimeStd.push(stimaStd(o, t, { CTRB_H: 0.1, ALTRO_PCT: 0.002, GG_MESE: 26, MOG: 0 }, festiviMese(2026, 9, st, fest).length));
    }
    for (const f of files("tracking_sic_set26")) {
      const st = stationDi(f);
      lav.push(...lavoratoriSic(st, leggiLavoratori(await grids(f), 2026, 9).lavoratori, idx, fest, TAR, festiviMese(2026, 9, st, fest).map((x) => x.data)));
    }
    const wb = excelStima({
      mese: "2026-09", stations: ST, oreStd, stimeStd, tariffeStd: t, meseTariffe: "2026-08",
      aditDwh: Object.entries(ag).flatMap(([s, v]) => Object.entries(v).map(([voce, x]) => ({ station: s, voce, ...x! }))),
      parStd: { TRASF: 22.5, TRASFDOM: 29.5, CTRB: 0.1, ALTRO: 0.002, GGMESE: 26, MOG: 0 },
      sic: { lav, busta: lav.map((x) => bustaLavoratore(x, PSIC)) }, sicLordo: ST.map((s) => sicLordo(s, lav.filter((x) => x.station === s), t, { dispatcherTrasferta: true })), parSic: PSIC, dispTrasferta: true,
      festivi: fest, nFestivi: Object.fromEntries(ST.map((s) => [s, festiviMese(2026, 9, s, fest).length])), rettifiche: [["prova", "", ""]], versioneAnagrafica: "2026-06",
    });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stima-"));
    const src = path.join(dir, "in", "Stima.xlsx");
    fs.mkdirSync(path.dirname(src));
    await wb.xlsx.writeFile(src);
    execFileSync("soffice", ["--headless", "--calc", "--convert-to", "xlsx", "--outdir", dir, src], { stdio: "ignore", timeout: 120_000 });
    const out = new ExcelJS.Workbook();
    await out.xlsx.readFile(path.join(dir, "Stima.xlsx"));
    const pg = out.worksheets[0];
    const riga = (lab: string) => { let r = 0; pg.eachRow((row, n) => { if (String(row.getCell(1).value).startsWith(lab)) r = n; }); return ST.map((_, i) => { const v = pg.getRow(r).getCell(i + 2).value as ExcelJS.CellFormulaValue | number; return Math.round(Number(typeof v === "object" ? v.result : v) * 100) / 100; }); };
    expect(riga("TOT COSTO STD")).toEqual([82043.59, 230192.21, 140528.9, 104714.36, 113367.55, 71322.26, 164139.21]);
    expect(riga("TOT COSTO SIC lordo")).toEqual([194398.05, 157104.52, 345777.19, 202045.4, 189224.56, 234449.84, 198067.06]);
    expect(riga("Teste SIC tracciate")).toEqual([51, 43, 89, 52, 49, 59, 51]);
    const sav = riga("€ Saving ratei").reduce((x, y) => x + y, 0);
    expect(sav).toBeCloseTo(119452.13, 1);
  }, 300_000);
});
