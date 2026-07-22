import { describe, it, expect } from "vitest";
import { normalizeModello, normalizeLeasingCompany } from "@/domain/vehicleNames";

describe("normalizeModello", () => {
  it("uniforma maiuscole/minuscole di marca e modello", () => {
    expect(normalizeModello("Fiat ducato")).toBe("Fiat Ducato");
    expect(normalizeModello("Fiat DUCATO")).toBe("Fiat Ducato");
    expect(normalizeModello("citroen jumpy")).toBe("Citroen Jumpy");
    expect(normalizeModello("Citroen JUMPY")).toBe("Citroen Jumpy");
  });

  it("corregge i refusi noti di marca", () => {
    expect(normalizeModello("PEUGEUT BOXER")).toBe("Peugeot Boxer");
    expect(normalizeModello("WOLSVAGEN CRAFTER")).toBe("Volkswagen Crafter");
    expect(normalizeModello("Vw Crafter")).toBe("Volkswagen Crafter");
    expect(normalizeModello("Reanult Traffic")).toBe("Renault Trafic");
  });

  it("corregge i refusi noti di modello", () => {
    expect(normalizeModello("Ford TRANIST")).toBe("Ford Transit");
    expect(normalizeModello("Ford TRANISIT")).toBe("Ford Transit");
    expect(normalizeModello("Peugeot boxster")).toBe("Peugeot Boxer");
    expect(normalizeModello("Peugeot EXSPORT")).toBe("Peugeot Expert");
    expect(normalizeModello("Toyota PROCACE")).toBe("Toyota Proace");
    expect(normalizeModello("Toyota Porace")).toBe("Toyota Proace");
    expect(normalizeModello("Renault Triffic")).toBe("Renault Trafic");
    expect(normalizeModello("Renault TRAFFIC")).toBe("Renault Trafic");
  });

  it("riconosce modelli composti da due parole", () => {
    expect(normalizeModello("Ford TRANSIT CUSTOM L2H2")).toBe("Ford Transit Custom L2H2");
    expect(normalizeModello("Ford TRANST CUSTOM")).toBe("Ford Transit Custom");
    expect(normalizeModello("Ford TRANSIT CUSTUM")).toBe("Ford Transit Custom");
    expect(normalizeModello("Opel Combo Cargo")).toBe("Opel Combo Cargo");
    expect(normalizeModello("Maxus Saic Motor")).toBe("Maxus Saic Motor");
  });

  it("riconosce il modello anche senza spazio prima della parentesi", () => {
    expect(normalizeModello("Fiat Ducato(l)")).toBe("Fiat Ducato (L)");
    expect(normalizeModello("Fiat Ducato(q)")).toBe("Fiat Ducato (Q)");
    expect(normalizeModello("Fiat Talento(u)")).toBe("Fiat Talento (U)");
  });

  it("uniforma i codici a singola lettera tra parentesi e le parole descrittive note", () => {
    expect(normalizeModello("Fiat Talento (i)")).toBe("Fiat Talento (I)");
    expect(normalizeModello("Fiat doblò (H)")).toBe("Fiat Doblò (H)");
    expect(normalizeModello("Fiat Ducato maxi (VGIA)")).toBe("Fiat Ducato Maxi (VGIA)");
    expect(normalizeModello("Fiat Talento Maxi(l)")).toBe("Fiat Talento Maxi (L)");
  });

  it("lascia invariati i codici multi-lettera e le misure (non sono parole descrittive)", () => {
    expect(normalizeModello("Fiat Ducato (VMIA)")).toBe("Fiat Ducato (VMIA)");
    expect(normalizeModello("Nissan NV400 L3H2")).toBe("Nissan NV400 L3H2");
    expect(normalizeModello("Ford Transit Custom 280")).toBe("Ford Transit Custom 280");
  });

  it("non forza spazi tra lettera e cifra attaccate (es. Deliver9)", () => {
    expect(normalizeModello("Maxus DELIVER9")).toBe("Maxus Deliver 9");
    expect(normalizeModello("Maxus Deliver 9 (CAT4)")).toBe("Maxus Deliver 9 (CAT4)");
  });

  it("lascia invariato un prefisso di marca non riconosciuto", () => {
    expect(normalizeModello("Sanjong SUCMOTOR CASSONATO")).toBe("Sanjong SUCMOTOR CASSONATO");
  });

  it("non prova a correggere un disallineamento marca/modello reale, solo a uniformare le maiuscole", () => {
    // "Fiat IVECO" è un errore di inserimento dati (Iveco non è un modello Fiat),
    // non un refuso di scrittura: la marca resta "Fiat" (già corretta), il
    // "modello" viene solo ricasato in Title Case, non spostato/rimosso
    expect(normalizeModello("Fiat IVECO")).toBe("Fiat Iveco");
    expect(normalizeModello("Ford Talento (I)")).toBe("Ford Talento (I)");
  });

  it("lascia invariati i placeholder", () => {
    expect(normalizeModello("N/D")).toBe("N/D");
    expect(normalizeModello("Veicolo storico (dati non disponibili — solo da import multe)"))
      .toBe("Veicolo storico (dati non disponibili — solo da import multe)");
  });

  it("è idempotente (applicarla due volte dà lo stesso risultato)", () => {
    const cases = ["Fiat ducato", "PEUGEUT BOXER", "Ford TRANST CUSTOM", "Fiat Ducato(l)", "N/D"];
    for (const c of cases) {
      const once = normalizeModello(c);
      expect(normalizeModello(once)).toBe(once);
    }
  });
});

describe("normalizeLeasingCompany", () => {
  it("uniforma le varianti note di scrittura", () => {
    expect(normalizeLeasingCompany("EUROPCAR")).toBe("Europcar");
    expect(normalizeLeasingCompany("HERTZ")).toBe("Hertz");
    expect(normalizeLeasingCompany("Herz")).toBe("Hertz");
    expect(normalizeLeasingCompany("Ayvenes")).toBe("Ayvens");
    expect(normalizeLeasingCompany("ARVAL FINE NOLEGGIO")).toBe("Arval");
    expect(normalizeLeasingCompany("ARVAL BT")).toBe("Arval");
    expect(normalizeLeasingCompany("ARVAL midterm")).toBe("Arval");
    expect(normalizeLeasingCompany("ALD MID TERM")).toBe("ALD MT");
  });

  it("mantiene distinti i canali commerciali reali", () => {
    expect(normalizeLeasingCompany("ALD")).toBe("ALD");
    expect(normalizeLeasingCompany("ALD MT")).toBe("ALD MT");
  });

  it("lascia invariata una compagnia non riconosciuta", () => {
    expect(normalizeLeasingCompany("FCA")).toBe("FCA");
    expect(normalizeLeasingCompany("Moviamo")).toBe("Moviamo");
    expect(normalizeLeasingCompany("NARDER")).toBe("NARDER");
  });

  it("gestisce valori vuoti/nulli", () => {
    expect(normalizeLeasingCompany(null)).toBeNull();
    expect(normalizeLeasingCompany(undefined)).toBeNull();
    expect(normalizeLeasingCompany("  ")).toBeNull();
  });
});
