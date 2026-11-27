import { describe, expect, it } from "vitest";
import { avvisiFile, indizi, nomiStandard, proponi, type RigaSmista } from "@/domain/compliance/smista";

const r = (entita: string, mese: number, folder: string, aperta = true, area = "Giuslavoro"): RigaSmista => ({ id: `${entita}-${mese}-${folder}`, entita, area, anno: 2026, mese, folder, aperta });
const REG = [
  r("PS", 9, "DM10 virtuale", false), r("PS", 10, "DM10 virtuale"), r("PS", 11, "DM10 virtuale"), r("ADECCO", 10, "DM10 virtuale"),
  r("PS", 10, "LUL_Riepilogo LUL"), r("ADECCO", 10, "LUL"), r("PS", 10, "F24 INPS IRPEF - quietanza"), r("PS", 10, "F24 Premio INAIL - quietanza"), r("PS", 10, "INAIL"),
  r("PS", 10, "D.U.R.C. online"), r("ADECCO", 10, "D.U.R.C. online"), r("PS", 10, "Varie – WHC"), r("PS", 10, "DURF", true, "Fiscale"),
  r("PS", 10, "Attestazioni di pagamento retribuzioni"), r("ADECCO", 10, "UNIEMENS"),
];

describe("dove va un file, dal nome", () => {
  it("legge mese, entità e station nei formati che arrivano", () => {
    expect(indizi("DM10_1026.pdf")).toMatchObject({ anno: 2026, mese: 10 });
    expect(indizi("Ricevuta_INPS.12345_2026-10.pdf")).toMatchObject({ anno: 2026, mese: 10 });
    expect(indizi("SSC_PS_TOTALE_102026.pdf")).toMatchObject({ entita: "PS", anno: 2026, mese: 10 });
    expect(indizi("DM10_4958_202610.pdf")).toMatchObject({ anno: 2026, mese: 10 });
    expect(indizi("cedolini ottobre 2026 Adecco DER1.pdf")).toMatchObject({ entita: "ADECCO", anno: 2026, mese: 10, station: "DER1" });
    expect(indizi("scansione0001.pdf")).toMatchObject({ entita: null, folder: null, mese: null });
  });
  it("propone la riga giusta", () => {
    expect(proponi("DM10_1026.pdf", REG).riga?.id).toBe("PS-10-DM10 virtuale");
    expect(proponi("LUL_ADECCO_DER1_1026.pdf", REG)).toMatchObject({ riga: { id: "ADECCO-10-LUL" }, certo: true });
    expect(proponi("LUL_PS_DLO4_1026.pdf", REG).riga?.id).toBe("PS-10-LUL_Riepilogo LUL");
    expect(proponi("F24 INAIL PS ottobre 2026.pdf", REG).riga?.folder).toBe("F24 Premio INAIL - quietanza");
    expect(proponi("F24 quietanza PS 10-2026.pdf", REG).riga?.folder).toBe("F24 INPS IRPEF - quietanza");
    expect(proponi("Durc_ADE IT valido fino 12.01.27.pdf", REG).riga?.entita).toBe("ADECCO");
    expect(proponi("DURF.pdf", REG).riga?.area).toBe("Fiscale");
    expect(proponi("RicevutaTrasmissione_998877.pdf", REG).riga?.folder).toBe("UNIEMENS");
    expect(proponi("WHC_IT_PROF_Ottobre2026.xlsx", REG).riga?.folder).toBe("Varie – WHC");
  });
  it("senza mese nel nome sceglie il mese più vecchio ancora aperto, e lo segnala come incerto", () => {
    const p = proponi("DM10 virtuale.pdf", REG);
    expect(p.riga?.id).toBe("PS-10-DM10 virtuale");
    expect(p.certo).toBe(false);
  });
  it("il mese scritto a parole senza anno: l'anno lo decide il registro", () => {
    const p = proponi("dm10 novembre.pdf", REG);
    expect(p.riga?.id).toBe("PS-11-DM10 virtuale");
    expect(p.certo).toBe(false);
  });
  it("un nome che non dice nulla non propone niente", () => {
    expect(proponi("scansione0001.pdf", REG).riga).toBeNull();
  });
});

describe("nome standard del file", () => {
  const p = { entita: "PS", folder: "DM10 virtuale", anno: 2026, mese: 10, station: null, originale: "scan.PDF" };
  it("riempie mese e anno e tiene l'estensione del file vero", () => {
    expect(nomiStandard("DM10_MMAA.pdf", p)).toEqual([{ nome: "DM10_1026.pdf", daCompletare: false }]);
    expect(nomiStandard("SSC_PS_TOTALE_MMAAAA.pdf", p)[0].nome).toBe("SSC_PS_TOTALE_102026.pdf");
    expect(nomiStandard("SANILOG_videata_AAAAMM.pdf", p)[0].nome).toBe("SANILOG_videata_202610.pdf");
    expect(nomiStandard("WHC_IT_PROF_<MESE>AAAA.xlsx", { ...p, originale: "whc.xlsx" })[0].nome).toBe("WHC_IT_PROF_Ottobre2026.xlsx");
    expect(nomiStandard("EBILOG_bonifico_Qn_AAAA.pdf", p)[0].nome).toBe("EBILOG_bonifico_Q4_2026.pdf");
  });
  it("più nomi per lo stesso folder, con la station", () => {
    expect(nomiStandard("LUL_PS_<DS>_MMAA.pdf + Cedolone_MMAA.pdf", { ...p, station: "DER1" })).toEqual([{ nome: "LUL_PS_DER1_1026.pdf", daCompletare: false }, { nome: "Cedolone_1026.pdf", daCompletare: false }]);
    expect(nomiStandard("LUL_PS_<DS>_MMAA.pdf", p)[0]).toEqual({ nome: "LUL_PS_<DS>_1026.pdf", daCompletare: true });
    expect(nomiStandard("SSC_AI_INAIL_MMAA_STD.pdf, _SL.pdf", p).map((x) => x.nome)).toEqual(["SSC_AI_INAIL_1026_STD.pdf", "SSC_AI_INAIL_1026_SL.pdf"]);
  });
  it("quello che il sito non può sapere resta da completare", () => {
    expect(nomiStandard("Durc_PS valido fino al GG.MM.AA.pdf", p)[0]).toEqual({ nome: "Durc_PS valido fino al GG.MM.AA.pdf", daCompletare: true });
    expect(nomiStandard("Ricevuta_<protocollo>_AAAA-MM.pdf", p)[0]).toEqual({ nome: "Ricevuta_<protocollo>_2026-10.pdf", daCompletare: true });
  });
  it("senza nome standard ne propone uno con folder, entità e mese", () => {
    expect(nomiStandard("", { ...p, folder: "DURF" })[0].nome).toBe("DURF_PS_1026.pdf");
    expect(nomiStandard("template portale", { ...p, folder: "Elenco del Personale", originale: "elenco.xlsx" })[0].nome).toBe("Elenco del Personale_PS_1026.xlsx");
  });
});

describe("avvisi sul file", () => {
  it("formato e peso", () => {
    expect(avvisiFile("solo PDF", "a.pdf", 1000)).toEqual([]);
    expect(avvisiFile("solo PDF", "a.jpg", 1000)).toHaveLength(1);
    expect(avvisiFile("xlsx", "a.xls", 3 * 1024 * 1024)).toHaveLength(2);
  });
});
