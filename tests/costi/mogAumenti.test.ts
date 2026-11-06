import { describe, it, expect } from "vitest";
import fs from "node:fs";
import ExcelJS from "exceljs";
import { leggiFoglio } from "@/lib/fatture/xlsxStream";
import { leggiLavoratori } from "@/domain/presenze/lavoratori";
import { contrattoDaRiga, controlloMog, isIntestazioneMog, mogDelMese, riepilogoMog, consolidamentiPrevisti, type ContrattoMog } from "@/domain/mog/mog";
import { aumentiDaExcel, aumentiDaPdf, meseDaNomeFile, unisciAumenti } from "@/domain/mog/aumenti";
import { pagine } from "../fatture/pdf";
import { esempio, grids, hasKit } from "./kit";

const LETTERA = `Gent. Sig. Mario, Rossi Buccinasco, 08/10/2026 In riferimento alla Sua lettera di assunzione n. 3300/1 del 04/09/2025, Le comunichiamo che, a partire dal 01/10/2026, in applicazione dell’art. 51 lett. F del CCNL ApL, la sua percentuale di MOG passa da 40,66% a 49,89%. Rimangono invariate`;

describe("MOG aumenti: lettura", () => {
  it("lettera PDF: contratto, data, % prima e dopo", () => {
    expect(aumentiDaPdf(LETTERA)).toEqual([{ fonte: "pdf", cf: null, nome: "Mario Rossi", sito: "Buccinasco", nContratto: "3300/1", pctPrima: 40.66, pctNuova: 49.89, validaDal: "2026-10-01", dataLettera: "2026-10-08" }]);
  });
  it("Excel: intestazione, CF, nuova %; unione per n. contratto", () => {
    const ex = aumentiDaExcel([["Città", "CDC", "DS", "Codice fiscale", "Nome", "Cognome", "N° contratto", "Nuova % MOG"], ["Buccinasco", 1528, "Buccinasco", "RSSMRA90A01F205X", "Mario", "Rossi", "3300/1", 49.89]]);
    const c = { cf: "RSSMRA90A01F205X", nome: "Mario", cognome: "Rossi", station: "DLO4", pctMog: 40.66 } as ContrattoMog;
    const u = unisciAumenti([...ex, ...aumentiDaPdf(LETTERA)], [c]);
    expect(u).toHaveLength(1);
    expect(u[0]).toMatchObject({ cf: "RSSMRA90A01F205X", station: "DLO4", pctPrima: 40.66, pctNuova: 49.89, validaDal: "2026-10-01", avvisi: [] });
    // solo Excel: data dal nome del file, con avviso
    const solo = unisciAumenti(ex, [c], meseDaNomeFile("Aumenti_MOG_2026_10.xlsx"));
    expect(solo[0].validaDal).toBe("2026-10-01");
    expect(solo[0].avvisi[0]).toMatch(/nome del file/);
  });
});

const haFile = hasKit && fs.existsSync(esempio("Aumenti MOG PS.xlsx")) && fs.existsSync(esempio("Mog_Cambio_Lavoratore_2026_10_PS.pdf")) && fs.existsSync(esempio("ADECCO_PS_2026_10.xlsx"));

describe.skipIf(!haFile)("MOG aumenti ottobre 2026 (file reali)", () => {
  it("12 aumenti dal 01/10/2026, Excel e PDF coincidono, tutti nel file MOG", async () => {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(fs.readFileSync(esempio("Aumenti MOG PS.xlsx")) as never);
    const righe: (string | number | null)[][] = [];
    wb.worksheets[0].eachRow((r) => righe.push((r.values as (string | number | null)[]).slice(1)));
    const ex = aumentiDaExcel(righe);
    const pdf = aumentiDaPdf((await pagine(esempio("Mog_Cambio_Lavoratore_2026_10_PS.pdf"))).map((p) => p.map((i) => i.str).join(" ")).join("\n"));
    expect([ex.length, pdf.length]).toEqual([12, 12]);
    const contratti: ContrattoMog[] = [];
    await leggiFoglio(fs.readFileSync(esempio("ADECCO_PS_2026_10.xlsx")), "PS", { intestazione: isIntestazioneMog, onRiga: (riga) => { const c = contrattoDaRiga(riga, Object.keys(riga)); if (c) contratti.push(c); } });
    const u = unisciAumenti([...ex, ...pdf], contratti);
    expect(u).toHaveLength(12);
    expect(u.every((a) => a.cf && a.validaDal === "2026-10-01" && a.fonti.length === 2)).toBe(true);
    expect(u.flatMap((a) => a.avvisi)).toEqual([]);
    expect(u.filter((a) => a.station === "DLO4").length).toBe(3);

    // effetto su DLO4 ottobre: il MOG dei 3 lavoratori aumenta dal 1/10
    const variazioni = u.map((a) => ({ cf: a.cf!, pctNuova: a.pctNuova, validaDal: a.validaDal! }));
    const dlo4 = u.filter((a) => a.station === "DLO4");
    for (const a of dlo4) expect(mogDelMese(contratti.find((c) => c.cf === a.cf)!, "2026-10", variazioni)).toBeCloseTo(a.pctNuova / 100 * 169, 1); // 26 giorni lun–sab a ottobre
    const { lavoratori } = leggiLavoratori(await grids(esempio("tracking_ott26_dlo4", "10_Tracking_Amazon_Drivers_2026_STD_ADECCO_DLO4.xlsx")), 2026, 10);
    const r = riepilogoMog(controlloMog({ station: "DLO4", mese: "2026-10", lavoratori, contratti, variazioni }));
    // con gli aumenti: 2 lavoratori a 72 h passano da OK a SOTTO MOG (MOG 81,98 e 84,31 h)
    expect([r.ok, r.sotto, r.zeroOre, r.nonInFile, r.nonNelTracking]).toEqual([30, 8, 0, 21, 0]);
    // 66,9 h senza aumenti + i due lavoratori aumentati (12,3 e 10,0 h) = 89,2 h, come nella lista integrazioni Adecco di ottobre (12,31 e 9,98)
    expect([r.oreMancanti, Math.round(r.costo * 100) / 100]).toEqual([89.2, 1860.72]);
    // gli aumenti coprono consolidamenti che il file dava come previsti
    expect(consolidamentiPrevisti(contratti, undefined, variazioni).length).toBe(consolidamentiPrevisti(contratti).length - u.filter((a) => { const c = contratti.find((k) => k.cf === a.cf)!; return /^s/i.test(c.supera20 ?? "") && c.nuovaPct !== null && a.pctNuova >= c.nuovaPct - 0.005; }).length);
  }, 300_000);
});
