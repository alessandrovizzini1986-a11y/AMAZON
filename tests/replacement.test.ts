import { describe, it, expect } from "vitest";
import { giorniScoperti, importoStorno, isPraticaStagnante } from "@/domain/replacement";

describe("giorniScoperti — giorni senza mezzo sostitutivo", () => {
  const ingresso = new Date(2026, 2, 1); // 1 marzo

  it("fino alla ricezione del sostitutivo", () => {
    expect(
      giorniScoperti({
        dataIngressoOfficina: ingresso,
        dataRicezioneSostitutivo: new Date(2026, 2, 6), // 6 marzo
        dataRientroOriginale: null,
        oggi: new Date(2026, 3, 1),
      })
    ).toBe(5);
  });

  it("fino a oggi se pratica aperta senza sostitutivo", () => {
    expect(
      giorniScoperti({
        dataIngressoOfficina: ingresso,
        dataRicezioneSostitutivo: null,
        dataRientroOriginale: null,
        oggi: new Date(2026, 2, 11),
      })
    ).toBe(10);
  });

  it("fino al rientro originale se avviene prima del sostitutivo", () => {
    expect(
      giorniScoperti({
        dataIngressoOfficina: ingresso,
        dataRicezioneSostitutivo: new Date(2026, 2, 20),
        dataRientroOriginale: new Date(2026, 2, 4),
        oggi: new Date(2026, 3, 1),
      })
    ).toBe(3);
  });

  it("zero se il sostitutivo arriva il giorno stesso", () => {
    expect(
      giorniScoperti({
        dataIngressoOfficina: ingresso,
        dataRicezioneSostitutivo: ingresso,
        dataRientroOriginale: null,
        oggi: new Date(2026, 3, 1),
      })
    ).toBe(0);
  });
});

describe("importoStorno", () => {
  it("giorni × (canone mensile ÷ giorni convenzionali), arrotondato al centesimo", () => {
    // canone mensile 900 ÷ 30 = 30€/giorno equivalente
    expect(importoStorno(5, 900)).toBe(150);
    expect(importoStorno(10, 415)).toBe(138.33);
  });
  it("accetta una base di giorni convenzionali diversa da 30 (configurabile)", () => {
    expect(importoStorno(5, 930, 31)).toBe(150);
  });
  it("rifiuta input negativi", () => {
    expect(() => importoStorno(-1, 10)).toThrow();
    expect(() => importoStorno(1, -10)).toThrow();
    expect(() => importoStorno(1, 10, 0)).toThrow();
  });
});

describe("isPraticaStagnante", () => {
  it("true se INVIATA oltre soglia senza risposta", () => {
    expect(
      isPraticaStagnante({
        stato: "INVIATA",
        inviataAt: new Date(2026, 0, 1),
        oggi: new Date(2026, 0, 20),
        sogliaGiorni: 15,
      })
    ).toBe(true);
  });
  it("false se confermata o entro soglia", () => {
    expect(
      isPraticaStagnante({ stato: "CONFERMATA", inviataAt: new Date(2026, 0, 1), oggi: new Date(2026, 0, 20), sogliaGiorni: 15 })
    ).toBe(false);
    expect(
      isPraticaStagnante({ stato: "INVIATA", inviataAt: new Date(2026, 0, 10), oggi: new Date(2026, 0, 20), sogliaGiorni: 15 })
    ).toBe(false);
  });
});
