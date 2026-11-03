import { describe, it, expect } from "vitest";
import { fattureDaStorico, righeStorico } from "@/domain/fatture/storico";
import { csv, numIt } from "./fix";
import { statiCaricamento } from "@/domain/fatture/importa";
import type { Fattura } from "@/domain/fatture/parser";

describe("§3.3 carica storico (fatt_2026 del kit)", () => {
  const e = righeStorico(csv("fatturato", "fatt_2026_completo_al_24-10.csv"));
  it("12.361 righe, nessuna scartata, chiavi uniche (anche con righe identiche)", () => {
    expect(e.righe.length).toBe(12361);
    expect(e.scartate).toBe(0);
    expect(new Set(e.righe.map((r) => r.chiave)).size).toBe(12361);
    expect(righeStorico(csv("fatturato", "fatt_2026_completo_al_24-10.csv")).righe.map((r) => r.chiave)).toEqual(e.righe.map((r) => r.chiave));
    // rateo scritto come 0.22 o 22%: sempre 0,22 (6 righe senza rateo né tasse restano vuote)
    expect([...new Set(e.righe.map((r) => r.rateo))].sort()).toEqual([0, 0.22]);
    expect(e.righe.filter((r) => r.tasse === "").length).toBe(6);
  });
  it("raggruppate per Numero = registro_iniziale_numeri.csv (586 fatture: DS, date, righe, AVERE)", () => {
    const f = new Map(fattureDaStorico(e.righe).map((x) => [x.numero, x]));
    const reg = csv("registro_iniziale_numeri.csv").filter((r) => r.origine.startsWith("fatt_2026"));
    expect(reg.length).toBe(509);
    const ko = reg.filter((r) => { const x = f.get(r.Numero); return !x || x.ds !== r.DS || x.da !== r.data_min || x.a !== r.data_max || x.nRighe !== Number(r.righe) || Math.abs(x.avere - numIt(r.avere)) > 0.01; });
    // eccezione nota del kit: per 0001960 il registro ha AVERE 15.868,12, cioè senza la prima riga dati del CSV
    // (MFN Pickup, 488,10); il fatturato atteso del §8.6 invece la include (DER1 gennaio 384.351,83)
    expect(ko.map((r) => r.Numero)).toEqual(["INV-IT3JDBF-0001960"]);
    expect(f.get("INV-IT3JDBF-0001960")!.avere).toBeCloseTo(15868.12 + 488.1, 2);
  });
});

describe("§2 stati del caricamento", () => {
  const fatt = (numero: string | null, righe = 1) => ({ numero, template: "A", ds: "DER1", righe: Array(righe).fill({}) }) as unknown as Fattura;
  it("ogni file ha uno stato: nuova, già presente, doppione, errore", () => {
    const s = statiCaricamento([
      { file: "a.pdf", sha256: "1", fattura: fatt("INV-X-0001") },
      { file: "b.pdf", sha256: "2", fattura: fatt("INV-X-0001") },
      { file: "c.pdf", sha256: "3", fattura: fatt("INV-X-0002") },
      { file: "d.pdf", sha256: "4", fattura: fatt(null, 0) },
      { file: "e.pdf", sha256: "5", errore: "PDF illeggibile" },
    ], { "INV-X-0002": { esportataIl: "2026-11-03T10:00:00Z", presenteInFatt2026Il: null } });
    expect(s.map((x) => x.stato)).toEqual(["nuova", "doppione nel caricamento", "già presente", "errore", "errore"]);
    expect(s[2].motivo).toMatch(/esportata il 03\/11\/2026/);
    expect(s[3].motivo).toBe("template non riconosciuto");
  });
});
