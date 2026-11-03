import { describe, it, expect } from "vitest";
import { completato, percorsoConsuntivo, percorsoCostiFineMese, percorsoFatture, percorsoPresenze, percorsoTelepass, prossimo, stati } from "@/domain/percorsi/percorso";

const s = (p: { passi: { id: string; stato: string }[] }) => p.passi.map((x) => `${x.id}:${x.stato}`).join(" ");

describe("percorsi a binario", () => {
  it("il primo obbligatorio non fatto è 'ora', i facoltativi non bloccano", () => {
    const p = stati([{ id: "a", titolo: "", fatto: true }, { id: "b", titolo: "", fatto: false, facoltativo: true }, { id: "c", titolo: "", fatto: false }, { id: "d", titolo: "", fatto: false }]);
    expect(p.map((x) => x.stato)).toEqual(["fatto", "facoltativo", "ora", "dopo"]);
  });
  it("costi: senza ADIT del mese prima il passo da fare è l'ADIT; tutto salvato = completato", () => {
    const a = percorsoCostiFineMese({ mese: "2026-10", anagraficaEtaMesi: 2, aditMesePrec: false, stimaStd: false, stimaSic: false });
    expect(prossimo(a)!.id).toBe("adit");
    const b = percorsoCostiFineMese({ mese: "2026-10", anagraficaEtaMesi: 2, aditMesePrec: true, stimaStd: true, stimaSic: true });
    expect([prossimo(b), completato(b)]).toEqual([null, true]);
    expect(s(percorsoCostiFineMese({ mese: "2026-10", anagraficaEtaMesi: 5, aditMesePrec: true, stimaStd: true, stimaSic: false }))).toBe("anagrafica:ora adit:fatto stima-std:fatto stima-sic:dopo teams:facoltativo");
  });
  it("consuntivo: ADIT, poi riconciliazione STD, poi paga, poi SIC", () => {
    expect(prossimo(percorsoConsuntivo({ mese: "2026-09", aditMese: true, payrollMeseSucc: false, ricStd: true, ricSic: false }))!.id).toBe("payroll");
  });
  it("fatture: esportate e non incollate → il passo è incollare", () => {
    const p = percorsoFatture({ importateSettimana: 12, esportateNonInFatt: 3, allineateSettimana: 0 });
    expect(prossimo(p)!.id).toBe("incolla");
    expect(p.passi.find((x) => x.id === "incolla")!.nota).toContain("3 esportate");
    expect(completato(percorsoFatture({ importateSettimana: 12, esportateNonInFatt: 0, allineateSettimana: 12 }))).toBe(true);
  });
  it("presenze e telepass", () => {
    expect(prossimo(percorsoPresenze({ settimana: "2026-10-25", runSettimana: true, esitiAperti: 4, mese: "2026-10", runFineMese: false }))!.id).toBe("esiti");
    expect(prossimo(percorsoTelepass({ mese: "2026-10", anagraficheAggiornate: true, telepass: true, q8: false }))!.id).toBe("q8");
  });
});
