import { describe, expect, it } from "vitest";
import { attivoNelMese, giorniA, scadenzaInterna, scadenzaPortale } from "@/domain/compliance/scadenze";
import { chiusa, mia, puoSpuntare, puoTogliereSpunta, scaduta, soloCompliance } from "@/domain/compliance/stato";
import { ARRETRATI, FAC_SIMILE, STATO_INIZIALE, TEMPLATE } from "@/domain/compliance/seed";
import { differenze } from "@/domain/compliance/importa";
import { mailRichiesta, mailto } from "@/domain/compliance/mail";
import { can } from "@/lib/rbac";

describe("scadenze (casi della specifica)", () => {
  const casi: [number, number, string, string, string][] = [
    [2026, 10, "fine_M+1", "2026-11-30", "2026-11-23"], [2026, 10, "15_M+2", "2026-12-15", "2026-12-08"], [2026, 11, "fine_M+1", "2026-12-31", "2026-12-24"],
    [2026, 11, "15_M+2", "2027-01-15", "2027-01-08"], [2026, 12, "fine_M+1", "2027-01-31", "2027-01-25"], [2026, 10, "20_M+1", "2026-11-20", "2026-11-13"],
  ];
  for (const [a, m, regola, portale, interna] of casi) it(`${m}/${a} ${regola} → ${portale}, interna ${interna}`, () => {
    expect(scadenzaPortale(regola, a, m)).toBe(portale);
    expect(scadenzaInterna(portale)).toBe(interna);
  });
  it("manuale non calcola; i giorni mancanti sono di calendario", () => {
    expect(scadenzaPortale("manuale", 2026, 10)).toBeNull();
    expect(scadenzaInterna(null)).toBeNull();
    expect(giorniA("2026-11-30", "2026-11-27")).toBe(3);
    expect(giorniA("2026-11-20", "2026-11-27")).toBe(-7);
  });
  it("mesi attivi: vuoto = sempre, altrimenti solo quelli", () => {
    expect(attivoNelMese("", 3)).toBe(true);
    expect(attivoNelMese("1,4,7,10", 10)).toBe(true);
    expect(attivoNelMese("1,4,7,10", 11)).toBe(false);
  });
});

describe("stati e permessi", () => {
  it("chiusa: validato o non applicabile; i No workflow già a caricato", () => {
    expect(chiusa("VALIDATO", true)).toBe(true);
    expect(chiusa("CARICATO", true)).toBe(false);
    expect(chiusa("CARICATO", false)).toBe(true);
    expect(chiusa("NON_APPLICABILE", true)).toBe(true);
  });
  it("scaduta solo se aperta e oltre la scadenza del portale", () => {
    expect(scaduta({ stato: "RICHIESTO", scadenzaPortale: "2026-11-20" }, true, "2026-11-27")).toBe(true);
    expect(scaduta({ stato: "VALIDATO", scadenzaPortale: "2026-11-20" }, true, "2026-11-27")).toBe(false);
    expect(scaduta({ stato: "RICHIESTO", scadenzaPortale: "2026-11-30" }, true, "2026-11-30")).toBe(false);
  });
  it("la spunta la toglie chi l'ha messa, l'admin tutte", () => {
    const r = { stato: "CARICATO", caricatoDaId: "u1" };
    expect(puoTogliereSpunta(r, { id: "u1", admin: false })).toBe(true);
    expect(puoTogliereSpunta(r, { id: "u2", admin: false })).toBe(false);
    expect(puoTogliereSpunta(r, { id: "u2", admin: true })).toBe(true);
    expect(puoSpuntare("DA_RICHIEDERE")).toBe(true);
    expect(puoSpuntare("VALIDATO")).toBe(false);
  });
  it("ruolo Compliance: vede e spunta, non gestisce, e non esce da /compliance", () => {
    expect(can({ role: "COMPLIANCE" }, "compliance.view")).toBe(true);
    expect(can({ role: "COMPLIANCE" }, "compliance.manage")).toBe(false);
    expect(can({ role: "COMPLIANCE" }, "home.view")).toBe(false);
    expect(can({ role: "ADMIN" }, "compliance.manage")).toBe(true);
    for (const p of ["/compliance", "/compliance/riga/abc", "/api/compliance/fac-simile/01", "/account"]) expect(soloCompliance(p)).toBe(true);
    for (const p of ["/home", "/vehicles", "/personale-buste", "/api/personale/buste", "/compliancex", "/users"]) expect(soloCompliance(p)).toBe(false);
  });
  it("\"Solo le mie\": un owner doppio è di entrambi", () => {
    expect(mia("Rossi / De Luca", { nome: "Paolo", cognome: "Rossi" })).toBe(true);
    expect(mia("Rossi / De Luca", { nome: "Franco", cognome: "De Luca" })).toBe(true);
    expect(mia("Mario Bianchi", { nome: "Franco", cognome: "De Luca" })).toBe(false);
    expect(mia("Anna", { nome: "Anna", cognome: "Verdi" })).toBe(true);
  });
});

describe("seed", () => {
  it("36 folder, nomi unici per entità e area, fac-simile in elenco", () => {
    expect(TEMPLATE.filter((t) => t.entita === "PS" && t.area === "Giuslavoro")).toHaveLength(17);
    expect(TEMPLATE.filter((t) => t.entita === "ADECCO")).toHaveLength(15);
    expect(TEMPLATE.filter((t) => t.area === "Fiscale")).toHaveLength(4);
    expect(new Set(TEMPLATE.map((t) => `${t.entita}|${t.area}|${t.folder}`)).size).toBe(TEMPLATE.length);
    for (const t of TEMPLATE) if (t.facSimile) expect(FAC_SIMILE[t.facSimile]?.length, `${t.folder}: fac-simile ${t.facSimile}`).toBeGreaterThan(0);
  });
  it("stato iniziale e arretrati puntano a folder che esistono", () => {
    for (const x of [...STATO_INIZIALE, ...ARRETRATI]) expect(TEMPLATE.some((t) => t.entita === x.entita && t.area === (x.area ?? "Giuslavoro") && t.folder === x.folder), `${x.entita} ${x.folder}`).toBe(true);
  });
});

describe("import dal portale", () => {
  const reg = [
    { id: "a", entita: "PS", area: "Giuslavoro", anno: 2026, mese: 10, folder: "UNIEMENS", stato: "DA_RICHIEDERE" as const, scadenzaPortale: "2026-12-15" },
    { id: "b", entita: "PS", area: "Giuslavoro", anno: 2026, mese: 10, folder: "TRC payroll file", stato: "CARICATO" as const, scadenzaPortale: "2026-11-30" },
    { id: "c", entita: "PS", area: "Giuslavoro", anno: 2026, mese: 9, folder: "LUL_Riepilogo LUL", stato: "CARICATO" as const, scadenzaPortale: "2026-11-30" },
  ];
  const p = (x: object) => ({ entita: "PS", area: "Giuslavoro", anno: 2026, mese: 10, folder: "UNIEMENS", stato_portale: "OPEN" as const, ...x });
  it("folder inesistente: avviso, nessuna riga creata", () => {
    const r = differenze([p({ folder: "Folder che non c'è" })], reg);
    expect(r.diff).toEqual([]);
    expect(r.nonTrovati).toHaveLength(1);
  });
  it("spunta messa ma folder vuoto sul portale: incongruenza, lo stato non cambia", () => {
    const [d] = differenze([p({ folder: "TRC payroll file" })], reg).diff;
    expect(d.statoDopo).toBeNull();
    expect(d.avviso).toContain("Incongruenza");
  });
  it("validato, in validazione, respinto e nuova scadenza", () => {
    expect(differenze([p({ stato_portale: "VALIDATED" })], reg).diff[0].statoDopo).toBe("VALIDATO");
    expect(differenze([p({ stato_portale: "VALIDATION_IN_PROGRESS" })], reg).diff[0].statoDopo).toBe("CARICATO");
    const [x] = differenze([p({ mese: 9, folder: "LUL_Riepilogo LUL", file: [{ nome: "x.pdf", nota: "FileNonConforme" }], scadenza_portale: "2026-12-04" })], reg).diff;
    expect(x).toMatchObject({ statoDopo: "RESPINTO", motivo: "FileNonConforme", scadenzaDopo: "2026-12-04", scadenzaInterna: "2026-11-27" });
    expect(differenze([p({})], reg).diff).toEqual([]);
  });
});

describe("mail", () => {
  it("la richiesta elenca le righe con la scadenza interna e si apre come mailto", () => {
    const m = mailRichiesta({ nome: "Mario", entita: "PS", anno: 2026, mese: 10, link: "https://x/compliance", righe: [{ folder: "UNIEMENS", area: "Giuslavoro", documento: "Ricevuta", formato: "PDF", nomeFileStandard: "Ricevuta_<protocollo>_AAAA-MM.pdf", scadenzaInterna: "2026-12-08", scadenzaPortale: "2026-12-15", dataRichiesta: null }] });
    expect(m.oggetto).toBe("Compliance Tool Amazon – documenti Ottobre 2026 – Professional Solutions Srl");
    expect(m.testo).toContain("1. Ricevuta (PDF)");
    // chi riceve la risposta deve sapere in quale folder caricare il file
    expect(m.testo).toContain("Folder del portale: Professional Solutions Srl → Giuslavoro → Ottobre 2026 → «UNIEMENS»");
    expect(m.testo).toContain("Nome del file: Ricevuta_<protocollo>_AAAA-MM.pdf");
    expect(m.testo).toContain("Entro il 08/12/2026");
    expect(mailto("a@b.it", m)).toMatch(/^mailto:a%40b\.it\?subject=Compliance%20Tool/);
  });
});
