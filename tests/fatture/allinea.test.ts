import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { estraiNumeri, numeriDaTesto } from "@/domain/fatture/allinea";
import { leggiFoglio, type CellaX } from "@/lib/fatture/xlsxStream";
import { fix } from "./fix";

describe("§8.8 allinea con AGGREGATO (file mini)", () => {
  it("legge solo fatt_2026, 24 numeri distinti normalizzati, 2 righe con Numero vuoto", async () => {
    const valori: CellaX[] = [];
    const r = await leggiFoglio(fs.readFileSync(fix("fatturato", "AGGREGATO_mini_test.xlsx")), "fatt_2026", { colonne: ["numero"], onRiga: (x) => valori.push(x.numero) });
    const att = JSON.parse(fs.readFileSync(fix("fatturato", "atteso_AGGREGATO_mini.json"), "utf8"));
    const e = estraiNumeri(valori);
    expect(r.mancanti).toEqual([]);
    expect([e.righe, e.numeri.length, e.righeNumeroVuoto, e.refusiCorretti]).toEqual([att.righe_totali, att.numeri_distinti_attesi, att.righe_numero_vuoto, att.refusi_NV_corretti]);
    expect(e.numeri.every((n) => /^INV-IT3JDBF-\d{7}$/.test(n))).toBe(true);
    expect(e.numeri).toContain("INV-IT3JDBF-0002032");
  });
  it("legge tutte le 16 colonne con tipi corretti (per il carica storico)", async () => {
    const righe: Record<string, CellaX>[] = [];
    await leggiFoglio(fs.readFileSync(fix("fatturato", "AGGREGATO_mini_test.xlsx")), "fatt_2026", { onRiga: (x) => righe.push(x) });
    expect(righe.length).toBe(300);
    expect(Object.keys(righe[0]).length).toBe(16);
    expect(righe[0]).toMatchObject({ DS: "DVN1", Descrizione: "Nursery Route Level 4 - Block of 7 Hours 48 Minutes", "Quantità": 2, Numero: "INV-IT3JDBF-0002561" });
    expect(typeof righe[0].Data).toBe("number");
  });
  it("foglio mancante: errore chiaro con l'elenco dei fogli", async () => {
    await expect(leggiFoglio(fs.readFileSync(fix("fatturato", "AGGREGATO_mini_test.xlsx")), "fatt_2025")).rejects.toThrow(/fatt_2025.*pivot, fatt_2026, MACRO_ROTTE/);
  });
  it("ripiego: numeri incollati", () => {
    expect(estraiNumeri(numeriDaTesto("INV-IT3JDBF-0002032\n nv-it3jdbf-0002033\n\nINV-IT3JDBF-0002032")).numeri).toEqual(["INV-IT3JDBF-0002032", "INV-IT3JDBF-0002033"]);
  });
});
