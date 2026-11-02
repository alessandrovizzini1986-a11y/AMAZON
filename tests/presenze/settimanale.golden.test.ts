import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { controlloSettimanale, type EsitoSettimanale, type TrackingInput } from "@/domain/presenze/controlloSettimanale";
import type { FlexRow } from "@/domain/presenze/flex";
import { GIUSTIFICATIVI_DEFAULT } from "@/domain/presenze/regole";
import { DISPATCHER_DEFAULT } from "@/domain/presenze/dispatcher";
import { hasKit, iso, KIT, loadFlex, loadTracking, readSheet } from "./kit";

const PERIODO = { da: "2026-10-01", a: "2026-10-25" };

describe.skipIf(!hasKit)("controllo settimanale — golden ottobre 2026", () => {
  let flex: FlexRow[];
  let trk: Record<string, TrackingInput[]>;
  const esiti: Record<string, EsitoSettimanale> = {};

  beforeAll(async () => {
    flex = loadFlex(path.join(KIT, "esempi/flex/FLEX_TUTTI.csv")).rows;
    trk = { DLO4: await loadTracking(path.join(KIT, "esempi/trk/DLO4")), DVN1: await loadTracking(path.join(KIT, "esempi/trk/DVN1")) };
    const tutti = [...trk.DLO4, ...trk.DVN1];
    for (const st of ["DLO4", "DVN1"] as const) {
      esiti[st] = controlloSettimanale(trk[st], flex, {
        station: st, ...PERIODO,
        giustificativi: GIUSTIFICATIVI_DEFAULT.map((g) => g.codice),
        dispatcher: DISPATCHER_DEFAULT,
      }, tutti);
    }
  }, 120_000);

  for (const st of ["DLO4", "DVN1"] as const) {
    it(`${st}: foglio Dettaglio identico all'atteso (esito, categoria, ore, trasferta, pacchi)`, async () => {
      const attese = await readSheet(path.join(KIT, `attesi/Controllo_trasferte_${st}_ott26.xlsx`), "Dettaglio");
      const k = (tipo: unknown, id: unknown, d: unknown) => `${tipo}|${id}|${iso(d)}`;
      const nostre = new Map(esiti[st].dettaglio.map((r) => [k(r.tipo, r.driverId, r.data), r]));
      expect(nostre.size).toBe(attese.length);
      const diff: string[] = [];
      for (const a of attese) {
        const r = nostre.get(k(a.Tipo, a.DriverID, a.Data));
        if (!r) { diff.push(`manca ${k(a.Tipo, a.DriverID, a.Data)} ${a.Driver}`); continue; }
        const exp = [a.Esito, a.Categoria ?? "", Number(a.OreLavorate), Number(a.TrasfFile), a.PacchiAmazon ?? null, a.MatchAmazon ?? "", a.InRottaAmazon];
        const got = [r.esitoBase, r.categoriaBase, r.ore, r.trasferta, r.pacchi, r.match, r.inRotta];
        if (JSON.stringify(exp) !== JSON.stringify(got)) diff.push(`${a.Driver} ${iso(a.Data)}: atteso ${JSON.stringify(exp)} ottenuto ${JSON.stringify(got)}`);
      }
      expect(diff.slice(0, 15)).toEqual([]);
    });

    it(`${st}: Amazon non in tracking identico all'atteso`, async () => {
      const attese = await readSheet(path.join(KIT, `attesi/Controllo_trasferte_${st}_ott26.xlsx`), "Amazon_non_in_tracking");
      const exp = attese.filter((a) => a.DriverID).map((a) => `${iso(a.Data)}|${a.DriverID}|${a.Pacchi}`).sort();
      const got = esiti[st].nonInTracking.map((n) => `${n.data}|${n.driverId}|${n.pacchi}`).sort();
      expect(got).toEqual(exp);
    });
  }

  it("DLO4 dopo le esclusioni: A = Manfredi + 6 driver DLO2 (nota DLO2), +1 residuo = Rednic 22/10", () => {
    const e = esiti.DLO4;
    const a = e.nonInTracking.filter((n) => n.categoria === "A");
    expect(a.map((n) => `${n.driver}|${n.data}`).sort()).toEqual([
      "Cristian Manfredi|2026-10-03",
      "Fernando Hector Climaco Ingaruca|2026-10-07",
      "Luca Gigante|2026-10-08",
      "Maycol Palacios|2026-10-07",
      "Meryem Chiguer|2026-10-08",
      "Nicola Andrisani|2026-10-09",
      "Udo Usvardi|2026-10-09",
    ]);
    for (const n of a.filter((x) => x.driver !== "Cristian Manfredi")) expect(n.nota).toContain("DLO2");
    const piu1 = e.dettaglio.filter((r) => r.categoria === "+1");
    expect(piu1.map((r) => `${r.driver}|${r.data}`)).toEqual(["Claudiu Ionut Rednic|2026-10-22"]);
  });

  it("DVN1: nomi invertiti agganciati (Tontoroiu), nessun A per loro", () => {
    const e = esiti.DVN1;
    expect(e.nonInTracking.filter((n) => /tontoroiu/i.test(n.driver) && n.categoria === "A")).toEqual([]);
    expect(e.dettaglio.some((r) => /tontoroiu/i.test(r.driver) && r.match !== "")).toBe(true);
  });
});
