import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { avanzamentoGiorno, avanzamentoPercorso, giornoDiOggi, idSera, moduloSuperato, validaPiano, type StatoAttivita } from "@/domain/training/piano";
import { getPiano } from "@/lib/training/piano";

const vd = new Map([["00-mappa", new Set(["dove-vive-ogni-file"])], ["03-multe-flusso", new Set<string>()]]);
const att = (id: string, tipo = "do"): { id: string; tipo: string; chi: string; durata: number; testo: string; ancore?: string[] } => ({ id, tipo, chi: "Stagista", durata: 30, testo: "x" });
const base = () => ({
  titolo: "T", inizio: "2026-11-09", fine: "2026-11-20",
  moduli: [{ id: "Base", titolo: "Base", esame: "e", valida: "d1a2" }],
  giorni: [
    { day: 1, date: "2026-11-09", title: "G1", modulo: "Base", sezioni: ["00-mappa"], obiettivo: "o", attivita: [att("d1a1"), att("d1a2", "check")], sera: { leggi: ["03-multe-flusso"], nota: "n" } },
    { day: 2, date: "2026-11-12", title: "G2", modulo: "Base", sezioni: [], obiettivo: "o", attivita: [{ ...att("d2a1"), ancore: ["00-mappa#dove-vive-ogni-file"] }], sera: { leggi: [], nota: "" } },
  ],
});

describe("training: piano", () => {
  it("il piano vero è valido (sezioni e ancore del vademecum esistenti)", () => {
    const p = getPiano();
    expect(p.giorni.length).toBe(10);
    expect(new Set(p.giorni.flatMap((g) => g.attivita.map((a) => a.id))).size).toBe(p.giorni.reduce((a, g) => a + g.attivita.length, 0));
  });
  it("errori chiari: slug inesistente, ancora sbagliata, id doppio, modulo e tipo sbagliati", () => {
    expect(() => validaPiano(base(), vd)).not.toThrow();
    const p1 = base(); p1.giorni[0].sezioni = ["99-non-esiste"];
    expect(() => validaPiano(p1, vd)).toThrow(/sezione "99-non-esiste" non esiste/);
    const p2 = base(); p2.giorni[1].attivita[0].ancore = ["00-mappa#nessuna"];
    expect(() => validaPiano(p2, vd)).toThrow(/ancora "#nessuna" non esiste in 00-mappa/);
    const p3 = base(); p3.giorni[1].attivita[0].id = "d1a1";
    expect(() => validaPiano(p3, vd)).toThrow(/"d1a1" ripetuta/);
    const p4 = base(); p4.giorni[1].modulo = "Fatture";
    expect(() => validaPiano(p4, vd)).toThrow(/modulo "Fatture" non esiste/);
    const p5 = base(); (p5.giorni[0].attivita[0] as { tipo: string }).tipo = "lezione";
    expect(() => validaPiano(p5, vd)).toThrow(/tipo/);
    const p6 = base(); p6.giorni[1].date = "2026-11-31";
    expect(() => validaPiano(p6, vd)).toThrow(/data non valida/);
  });
  it("giorno di oggi: prima dell'inizio il primo, nel weekend il prossimo, dopo la fine l'ultimo", () => {
    const p = validaPiano(base(), vd);
    expect(giornoDiOggi(p, "2026-11-01")).toEqual({ day: 1, stato: "prima" });
    expect(giornoDiOggi(p, "2026-11-09")).toEqual({ day: 1, stato: "oggi" });
    expect(giornoDiOggi(p, "2026-11-10")).toEqual({ day: 2, stato: "prossimo" });
    expect(giornoDiOggi(p, "2026-12-01")).toEqual({ day: 2, stato: "finito" });
  });
  it("avanzamento: lettura serale conta, giorno validato quando tutti i check sono validati; modulo superato", () => {
    const p = validaPiano(base(), vd);
    const s = new Map<string, StatoAttivita>();
    expect(avanzamentoGiorno(p.giorni[0], s)).toMatchObject({ fatte: 0, totali: 3, stato: "da fare" });
    s.set("d1a1", { done: true, validated: false });
    expect(avanzamentoGiorno(p.giorni[0], s).stato).toBe("in corso");
    s.set("d1a2", { done: true, validated: false }); s.set(idSera(1), { done: true, validated: false });
    expect(avanzamentoGiorno(p.giorni[0], s)).toMatchObject({ completo: true, stato: "fatto" });
    expect(moduloSuperato(p.moduli[0], s)).toBe(false);
    s.set("d1a2", { done: true, validated: true });
    expect(avanzamentoGiorno(p.giorni[0], s).stato).toBe("validato");
    expect(moduloSuperato(p.moduli[0], s)).toBe(true);
    const extra = new Map([[2, [{ ...att("x-1"), tipo: "do" as const, extra: true }]]]);
    expect(avanzamentoPercorso(p, s, extra)).toMatchObject({ fatte: 3, totali: 5, giorniCompleti: 1, nGiorni: 2 });
  });
  it("il JSON del repo non contiene password", () => {
    expect(fs.readFileSync(path.join(process.cwd(), "content", "training", "piano.json"), "utf8")).not.toMatch(/password\s*[:=]/i);
  });
});
