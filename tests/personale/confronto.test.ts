import { describe, expect, it } from "vitest";
import { confronta, oreDalTracking, stimaSaldo, type OreBusta, type OreTracking } from "@/domain/personale/confronto";

const t = (x: Partial<OreTracking>): OreTracking => ({ mese: "2026-10", station: "DER1", gruppo: "SIC", chiave: "A", cf: "A", matricola: "1", nome: "Rossi Mario", contratto: "CTI FT", oreLavoro: 160, oreStraord: 0, oreSuppl: 0, oreFerie: 0, ggFerie: 0, oreRol: 0, oreExf: 0, oreMalattia: 0, oreInfortunio: 0, oreAltro: 0, ...x });
const b = (x: Partial<OreBusta>): OreBusta => ({ meseLavoro: "2026-10", station: "DER1", gruppo: "SIC", cf: "A", codice: "1", nome: "ROSSI MARIO", oreStraord: 0, oreSuppl: 0, oreFerie: 0, ggFerie: 0, oreRol: 0, oreExf: 0, oreMalattia: 0, oreInfortunio: 0, ...x });

describe("tracking contro busta", () => {
  it("uguale entro un quarto d'ora", () => {
    expect(confronta([t({ oreFerie: 16, oreStraord: 8 })], [b({ oreFerie: 16, oreStraord: 8.25 })])[0].esito).toBe("UGUALE");
  });
  it("stesse ore sotto un'altra voce: ROL nel tracking, ferie in busta", () => {
    const [r] = confronta([t({ oreRol: 8 })], [b({ oreFerie: 8 })]);
    expect(r.esito).toBe("VOCE_DIVERSA");
    expect(r.cosa).toContain("ROL nel tracking, in busta Ferie");
  });
  it("supplementare al posto di straordinario è uno scambio, ore in più no", () => {
    expect(confronta([t({ oreSuppl: 4 })], [b({ oreStraord: 4 })])[0].esito).toBe("VOCE_DIVERSA");
    const [r] = confronta([t({ oreStraord: 8 })], [b({ oreStraord: 16.5 })]);
    expect(r.esito).toBe("ORE_DIVERSE");
    expect(r.cosa).toContain("in meno della busta");
  });
  it("codice fiscale scritto male nel tracking: vale il nome nella stessa station", () => {
    const r = confronta([t({ cf: "X", chiave: "X", oreFerie: 8 })], [b({ oreFerie: 8 })]);
    expect(r.map((x) => x.esito)).toEqual(["UGUALE"]);
  });
  it("ferie nel tracking e malattia in busta è uno scambio di voce", () => {
    expect(confronta([t({ oreFerie: 32 })], [b({ oreMalattia: 32 })])[0].esito).toBe("VOCE_DIVERSA");
  });
  it("due cedolini della stessa persona nel mese si sommano", () => {
    const r = confronta([t({ oreSuppl: 31, oreStraord: 1 })], [b({ oreSuppl: 31 }), b({ cf: "A2", oreStraord: 1 })]);
    expect(r.map((x) => x.esito)).toEqual(["UGUALE"]);
  });
  it("chi c'è da una parte sola", () => {
    const r = confronta([t({}), t({ cf: "B", chiave: "B", nome: "Bianchi Luca" })], [b({}), b({ cf: "C", nome: "VERDI ANNA" })]);
    expect(r.map((x) => x.esito)).toEqual(["UGUALE", "SOLO_TRACKING", "SOLO_BUSTA"]);
  });
});

describe("ore dal tracking", () => {
  it("somma per voce e conta i giorni di ferie; fuori mese non conta", () => {
    const [x] = oreDalTracking([{ nome: "Rossi Mario", cf: "a", contratto: "FT", driverId: "", matricola: "1", giorni: { "2026-10-01": { Standard: 8, Straordinario: 1 }, "2026-10-02": { FERIE: 8 }, "2026-10-03": { FERIE: 4, ROL: 4 }, "2026-11-01": { FERIE: 8 } } }], "2026-10", "DER1", "SIC");
    expect(x).toMatchObject({ cf: "A", oreLavoro: 8, oreStraord: 1, oreFerie: 12, ggFerie: 2, oreRol: 4 });
  });
});

describe("stima del saldo", () => {
  it("toglie i giorni di ferie (o le ore, per chi le ha in ore) e le ore di ROL ed ex festività", () => {
    expect(stimaSaldo({ ferieUnita: "GG", ferieSaldo: 5, rolSaldo: 10, exfestSaldo: null }, { ggFerie: 2, oreFerie: 16, oreRol: 4, oreExf: 8 })).toEqual({ ferie: 3, rol: 6, exfest: null });
    expect(stimaSaldo({ ferieUnita: "ORE", ferieSaldo: 40, rolSaldo: 0, exfestSaldo: 8 }, { ggFerie: 2, oreFerie: 16, oreRol: 0, oreExf: 8 }).ferie).toBe(24);
  });
});
