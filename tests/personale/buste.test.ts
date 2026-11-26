import { describe, expect, it } from "vitest";
import { COEFF_COSTO_AZIENDA, costo, feriePerStation, orePerStation, piuStraordinari, ultimiRatei, type OrePersona, type RateiPersona, type TotaleMese, type VoceMese } from "@/domain/personale/buste";

const t = (x: Partial<TotaleMese>): TotaleMese => ({ mese: "2026-09", station: "DER2", gruppo: "SIC", teste: 10, lordo: 20000, tfr: 1000, impInps: 15000, senzaTotali: 0, ...x });
const v = (x: Partial<VoceMese>): VoceMese => ({ mese: "2026-09", station: "DER2", gruppo: "SIC", categoria: "RETRIBUZIONE", voce: "", importo: 0, ore: 0, persone: 0, ...x });

describe("costo", () => {
  it("toglie dal lordo anticipi INPS, 13ª/14ª, ferie liquidate e TFR liquidato, poi applica il coefficiente", () => {
    const c = costo([t({})], [v({ categoria: "ANTICIPI_INPS", importo: 500 }), v({ categoria: "MENSILITA", importo: 1500 }), v({ categoria: "STRAORDINARI", importo: 900 }), v({ categoria: "MENSILITA", voce: "Quattordicesima", importo: 1500 })]);
    expect(c.competenza).toBe(18000);
    expect(c.stimato).toBeCloseTo(19000 * COEFF_COSTO_AZIENDA);
  });
  it("conta solo le voci delle righe scelte (stesso mese, station, gruppo)", () => {
    const c = costo([t({})], [v({ categoria: "MENSILITA", importo: 1500, mese: "2026-07" }), v({ categoria: "MENSILITA", importo: 700, station: "DER1" })]);
    expect(c.competenza).toBe(20000);
  });
  it("per gli STD non stima il costo azienda (è la fattura dell'agenzia)", () => {
    expect(costo([t({ gruppo: "STD" })], []).stimato).toBeNull();
    expect(costo([], []).stimato).toBeNull();
  });
});

const o = (x: Partial<OrePersona>): OrePersona => ({ mese: "2026-09", station: "DER2", gruppo: "SIC", codice: "1", nome: "A", qualifica: "Autista", oreLav: 100, ggLav: 13, oreStr: 0, oreMagg: 0, ...x });
describe("ore e straordinari", () => {
  it("somma per station e conta chi ha fatto straordinari", () => {
    const [s] = orePerStation([o({ oreStr: 10 }), o({ codice: "2", oreLav: null })]);
    expect(s).toMatchObject({ persone: 2, oreLav: 100, oreStr: 10, conStr: 1 });
  });
  it("classifica chi fa più ore in più, con il mese più alto", () => {
    const p = piuStraordinari([o({ oreStr: 10 }), o({ mese: "2026-10", oreStr: 25 }), o({ codice: "2", nome: "B", oreStr: 30 }), o({ codice: "3", oreStr: 0 })]);
    expect(p.map((x) => x.nome)).toEqual(["A", "B"]);
    expect(p[0]).toMatchObject({ oreStr: 35, mesiCon: 2, max: 25, meseMax: "2026-10" });
  });
});

const r = (x: Partial<RateiPersona>): RateiPersona => ({ mese: "2026-10", station: "DER2", gruppo: "SIC", codice: "1", nome: "A", qualifica: "", ferieUnita: "GG", ferieSaldo: 5, ferieMatur: 18, ferieGoduto: 15, rolSaldo: 2, exfestSaldo: 1, ...x });
describe("ferie residue", () => {
  it("prende l'ultima busta di ogni gruppo (GLS a parte)", () => {
    const u = ultimiRatei([r({ mese: "2026-09" }), r({}), r({ gruppo: "STD", mese: "2026-09", ferieUnita: "ORE" }), r({ station: "GLS", mese: "2026-08" })]);
    expect(u.map((x) => `${x.station}${x.gruppo}${x.mese}`)).toEqual(["DER2SIC2026-10", "DER2STD2026-09", "GLSSIC2026-08"]);
  });
  it("conta chi supera la soglia e chi è in negativo, nella sua unità", () => {
    const [s] = feriePerStation([r({ ferieSaldo: 20 }), r({ codice: "2", ferieSaldo: -3 }), r({ codice: "3", ferieSaldo: null })]);
    expect(s).toMatchObject({ persone: 3, ferie: 17, oltre: 1, negativi: 1, unita: "GG" });
  });
});
