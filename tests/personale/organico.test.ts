import { describe, expect, it } from "vitest";
import { chiaveNome, controlliOrganico, type Dispositivo, type Persona } from "@/domain/personale/organico";

const oggi = new Date("2026-11-27");
const p = (x: Partial<Persona>): Persona => ({ cf: "A", matricola: "1", cognome: "Rossi", nome: "Mario", station: "DER1", mansione: "AUTISTA", dataCessazione: null, causaCessazione: "", scadenzaTd: null, dataAssunzione: null, ...x });
const d = (x: Partial<Dispositivo>): Dispositivo => ({ tipo: "Telefono", assegnatario: "MARIO ROSSI", station: "DER1", stato: "ASSEGNATO", cosa: "Samsung", ...x });

describe("incroci dell'organico", () => {
  it("riconosce la stessa persona scritta in modi diversi", () => {
    expect(chiaveNome("D'Angelò  Mario")).toBe(chiaveNome("MARIO D ANGELO"));
  });
  it("chi è uscito con un dispositivo ancora a suo nome è da ritirare; reso o rotto no", () => {
    const org = [p({ dataCessazione: new Date("2026-11-15"), causaCessazione: "DIMISSIONI" }), p({ cf: "B", cognome: "Bianchi", nome: "Luca" })];
    const c = controlliOrganico(org, [d({}), d({ tipo: "SIM", stato: "RESTITUITO" }), d({ assegnatario: "Luca Bianchi" })], [], oggi);
    expect(c.daRitirare).toHaveLength(1);
    expect(c.daRitirare[0].dispositivi.map((x) => x.tipo)).toEqual(["Telefono"]);
    expect(c.attivi).toBe(1);
  });
  it("contratti a termine: solo quelli che scadono entro i giorni dati, dal più vicino", () => {
    const c = controlliOrganico([p({ scadenzaTd: new Date("2027-01-10") }), p({ cf: "B", scadenzaTd: new Date("2026-12-05") }), p({ cf: "C", scadenzaTd: new Date("2027-06-01") })], [], [], oggi);
    expect(c.inScadenza.map((x) => [x.persona.cf, x.giorni])).toEqual([["B", 8], ["A", 44]]);
  });
  it("confronto con l'anagrafica costi: chi manca, chi è da togliere, chi ha cambiato station", () => {
    const org = [p({}), p({ cf: "B" }), p({ cf: "C", dataCessazione: new Date("2026-11-01") }), p({ cf: "E", station: "DER2" })];
    const cdl = [{ cf: "A", cognome: "", nome: "", station: "DER1" }, { cf: "C", cognome: "", nome: "", station: "DER1" }, { cf: "D", cognome: "", nome: "", station: "DER1" }, { cf: "E", cognome: "", nome: "", station: "DER1" }];
    const c = controlliOrganico(org, [], cdl, oggi);
    expect(c.mancanoInCdl.map((x) => x.cf)).toEqual(["B"]);
    expect(c.cdlDaTogliere.map((x) => x.cf)).toEqual(["C", "D"]);
    expect(c.stationDiversa.map((x) => x.persona.cf)).toEqual(["E"]);
    expect(controlliOrganico(org, [], [], oggi).mancanoInCdl).toEqual([]);
  });
});
