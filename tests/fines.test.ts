import { describe, it, expect } from "vitest";
import { scadenzaRicorso, findDriverForFine, riaddebitoEffettivo, type AssignmentWindow } from "@/domain/fines";

describe("scadenzaRicorso", () => {
  it("aggiunge il termine configurato alla data di notifica", () => {
    const s = scadenzaRicorso(new Date(2026, 0, 1), 60);
    expect(s.getTime()).toBe(new Date(2026, 2, 2).getTime());
  });
});

describe("findDriverForFine — assegnazione da log movimentazione", () => {
  const rossi: AssignmentWindow = {
    driverId: "u1",
    driverName: "Mario Rossi",
    date: new Date(Date.UTC(2026, 2, 10)),
    checkInAt: new Date(Date.UTC(2026, 2, 10, 6, 30)),
    checkOutAt: new Date(Date.UTC(2026, 2, 10, 17, 0)),
  };
  const bianchi: AssignmentWindow = {
    driverId: "u2",
    driverName: "Luca Bianchi",
    date: new Date(Date.UTC(2026, 2, 11)),
    checkInAt: null,
    checkOutAt: null,
  };

  it("match certo dentro la finestra check-in/out", () => {
    const r = findDriverForFine(new Date(Date.UTC(2026, 2, 10, 11, 0)), [rossi, bianchi]);
    expect(r?.driverId).toBe("u1");
    expect(r?.fonte).toContain("check-in/out");
  });

  it("fallback su assegnazione giornaliera senza check-in", () => {
    const r = findDriverForFine(new Date(Date.UTC(2026, 2, 11, 9, 0)), [rossi, bianchi]);
    expect(r?.driverId).toBe("u2");
    expect(r?.fonte).toContain("senza check-in");
  });

  it("nessun log coerente → null (multa resta da assegnare)", () => {
    const r = findDriverForFine(new Date(Date.UTC(2026, 2, 12, 9, 0)), [rossi, bianchi]);
    expect(r).toBeNull();
  });

  it("fuori dalla finestra oraria dello stesso giorno usa il fallback giornaliero", () => {
    const r = findDriverForFine(new Date(Date.UTC(2026, 2, 10, 20, 0)), [rossi]);
    expect(r?.driverId).toBe("u1");
    expect(r?.fonte).toContain("assegnazione giornaliera");
  });
});

describe("riaddebitoEffettivo — scadenza automatica a carico azienda", () => {
  const oggi = new Date(Date.UTC(2026, 6, 13));

  it("resta 'da addebitare' entro la soglia senza conducente", () => {
    const dataNotifica = new Date(Date.UTC(2026, 6, 1)); // 12 giorni fa
    const r = riaddebitoEffettivo({ riaddebito: "DA_ADDEBITARE", driverId: null, dataNotifica, oggi, sogliaGiorni: 30 });
    expect(r).toBe("DA_ADDEBITARE");
  });

  it("diventa 'non previsto' oltre la soglia senza conducente", () => {
    const dataNotifica = new Date(Date.UTC(2026, 4, 1)); // ~73 giorni fa
    const r = riaddebitoEffettivo({ riaddebito: "DA_ADDEBITARE", driverId: null, dataNotifica, oggi, sogliaGiorni: 30 });
    expect(r).toBe("NON_PREVISTO");
  });

  it("non scade se un conducente è già assegnato", () => {
    const dataNotifica = new Date(Date.UTC(2026, 4, 1));
    const r = riaddebitoEffettivo({ riaddebito: "DA_ADDEBITARE", driverId: "u1", dataNotifica, oggi, sogliaGiorni: 30 });
    expect(r).toBe("DA_ADDEBITARE");
  });

  it("non tocca stati già decisi manualmente (ADDEBITATO, CONTESTATO, ecc.)", () => {
    const dataNotifica = new Date(Date.UTC(2026, 4, 1));
    expect(riaddebitoEffettivo({ riaddebito: "ADDEBITATO", driverId: null, dataNotifica, oggi, sogliaGiorni: 30 })).toBe("ADDEBITATO");
  });

  it("senza data di notifica il termine non è ancora partito", () => {
    const r = riaddebitoEffettivo({ riaddebito: "DA_ADDEBITARE", driverId: null, dataNotifica: null, oggi, sogliaGiorni: 30 });
    expect(r).toBe("DA_ADDEBITARE");
  });
});
