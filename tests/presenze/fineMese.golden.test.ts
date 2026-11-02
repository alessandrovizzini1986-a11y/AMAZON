import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { controlloFineMese, isZucchettiName, stationFromZucchettiName, type EsitoFineMese } from "@/domain/presenze/controlloFineMese";
import { stationFromName, type Station } from "@/domain/presenze/regole";
import { tipoFromName } from "@/domain/presenze/tracking";
import type { SheetGrid } from "@/domain/presenze/grid";
import { workbookToGrids } from "@/lib/presenze/excelGrid";
import { hasKit, iso, KIT, readRows, readSheet } from "./kit";

describe.skipIf(!hasKit)("controllo fine mese — golden settembre 2026", () => {
  let e: EsitoFineMese;
  const atteso = path.join(KIT, "attesi/Controllo_Zucchetti_set26.xlsx");

  beforeAll(async () => {
    const dir = path.join(KIT, "esempi/set26");
    const trackingSic: Partial<Record<Station, SheetGrid[]>> = {};
    const zucchetti: Partial<Record<Station, SheetGrid[]>> = {};
    for (const f of fs.readdirSync(dir)) {
      const sheets = await workbookToGrids(fs.readFileSync(path.join(dir, f)));
      if (isZucchettiName(f)) zucchetti[stationFromZucchettiName(f)!] = sheets;
      else if (tipoFromName(f) === "SIC") trackingSic[stationFromName(f)!] = sheets;
    }
    e = controlloFineMese({ trackingSic, zucchetti, anno: 2026, mese: 9 });
  }, 120_000);

  it("Riepilogo identico: 394/394 abbinati, 6 station a delta zero, DER1 2 giorni (+8 h)", async () => {
    const att = await readSheet(atteso, "Riepilogo");
    const got = e.riepilogo.map((r) => [r.station, r.lavoratoriTracking, r.lavoratoriZucchetti, r.abbinati, r.soloTracking, r.soloZucchetti, r.giorniConDelta, r.deltaOreTot, r.oreTrackingTot, r.oreZucchettiTot]);
    const exp = att.map((a) => [a.Station, a.Lavoratori_tracking, a.Lavoratori_zucchetti, a.Abbinati, a.Solo_tracking, a.Solo_zucchetti, a.Giorni_con_delta, a.Delta_ore_tot, a.Ore_tracking_tot, a.Ore_zucchetti_tot]);
    expect(got).toEqual(exp);
    expect(e.riepilogo.reduce((s, r) => s + r.abbinati, 0)).toBe(394);
  });

  it("Delta_giorni identico (Mitroi Alexandru 12–13/9: +1 e +7)", async () => {
    const att = await readSheet(atteso, "Delta_giorni");
    expect(e.delta.map((d) => [d.station, d.matricola, d.lavoratore, d.data, d.oreTracking, d.oreZucchetti, d.delta, d.lettura])).toEqual(
      att.map((a) => [a.Station, String(a.Matricola), a.Lavoratore, iso(a.Data), a.Ore_tracking, a.Ore_zucchetti, a.Delta, a.Lettura]),
    );
  });

  it("Non_abbinati vuoto come l'atteso", async () => {
    expect(await readSheet(atteso, "Non_abbinati")).toEqual([]);
    expect(e.nonAbbinati).toEqual([]);
  });

  it("matrici V_<DS>: tracking e Zucchetti identici cella per cella", async () => {
    let celle = 0;
    for (const st of ["DER1", "DER2", "DLO2", "DLO4", "DLO5", "DLZ2", "DVN1"] as const) {
      // riga 1 titoli, riga 2 giorni; colonne: MATRICOLA, LAVORATORE, 30 giorni TRK, vuoto, 30 ZUC, …
      const vals = (await readRows(atteso, `V_${st}`)).slice(2).filter((r) => r[0] !== null);
      const nostre = e.matrici[st]!;
      const byKey = new Map(nostre.map((c) => [`${c.matricola}|${Number(c.data.slice(8))}`, c]));
      for (const r of vals) {
        for (let d = 1; d <= 30; d++) {
          const c = byKey.get(`${r[0]}|${d}`)!;
          expect([c.tracking, c.zucchetti].map((x) => Math.round(x * 100) / 100)).toEqual([r[1 + d] ?? 0, r[1 + 31 + d] ?? 0]);
          celle++;
        }
      }
    }
    expect(celle).toBe(394 * 30);
  });

  it("Tabella 6+domenica (SIC): esattamente i 49 nomi dell'atteso, nessun ≥7 consecutivi", async () => {
    const tutte = (await readRows(atteso, "Tabella 6+domenica (SIC)")).flat().filter((v): v is string => typeof v === "string" && v !== "");
    const intest = /^(DER1|DER2|DLO2|DLO4|DLO5|DLZ2|DVN1|\d{2}-[a-z]{3})$/;
    const attesi = tutte.filter((v) => !intest.test(v)).sort();
    const nostri = Object.values(e.tabellaSeiPiuDom).flatMap((t) => Object.values(t!).flat()).sort();
    expect(nostri.length).toBe(49);
    expect(nostri).toEqual(attesi);
    expect(e.consecutivi).toEqual([]);
  });
});
