/**
 * Anagrafica dei folder del Compliance Tool e stato letto dal portale il 27/11/2026 (sezioni 7 e 10 della specifica).
 * I nomi dei folder sono quelli del portale: l'import li abbina carattere per carattere.
 */
import type { Stato } from "./stato";

export type TemplateSeed = { entita: "PS" | "ADECCO"; area: "Giuslavoro" | "Fiscale"; ordine: number; folder: string; documento: string; formato: string; nomeFileStandard: string; facSimile: string | null; workflow: boolean; regolaScadenza: string; frequenza: string; mesiAttivi: string; owner: string; usato: boolean };

// Nel repo solo i ruoli: i nomi veri dei referenti stanno nel database (Gestione → Anagrafica), non nel codice.
const DR = "Referente PS", CF = "Referenti Adecco", AL = "Titolare";
type R = [folder: string, documento: string, formato: string, nome: string, fac: string | null, workflow: boolean, regola: string, frequenza: string, owner: string, usato: boolean, mesi?: string];
const t = (entita: "PS" | "ADECCO", area: "Giuslavoro" | "Fiscale", righe: R[]): TemplateSeed[] =>
  righe.map(([folder, documento, formato, nomeFileStandard, facSimile, workflow, regolaScadenza, frequenza, owner, usato, mesi], i) => ({ entita, area, ordine: i + 1, folder, documento, formato, nomeFileStandard, facSimile, workflow, regolaScadenza, frequenza, mesiAttivi: mesi ?? "", owner, usato }));

export const TEMPLATE: TemplateSeed[] = [
  ...t("PS", "Giuslavoro", [
    ["DM10 virtuale", "Ricevuta DM10 virtuale con totale del mese e protocollo INPS definitivo", "PDF", "DM10_MMAA.pdf", "01", true, "15_M+2", "mensile", DR, true],
    ["UNIEMENS", "Ricevuta denuncia UNIEMENS protocollata INPS", "PDF", "Ricevuta_<protocollo>_AAAA-MM.pdf", "02", true, "15_M+2", "mensile", DR, true],
    ["F24 INPS IRPEF - quietanza", "F24 quietanzato con contributi INPS del mese", "solo PDF", "SSC_PS_TOTALE_MMAAAA.pdf", "03", true, "fine_M+1", "mensile", DR, true],
    ["D.U.R.C. online", "DURC in corso di validità", "PDF", "Durc_PS valido fino al GG.MM.AA.pdf", "04", true, "manuale", "a_scadenza", DR, true],
    ["Cassetto Previdenziale INPS", "Cassetto Previdenziale del Contribuente, unico PDF, F24 mensili", "PDF", "Cassetto Previdenziale_MMAAAA.pdf", "05", true, "fine_M+1", "trimestrale", DR, true],
    ["INAIL", "Autoliquidazione INAIL + anagrafica + contabile ditta", "PDF", "INAIL_PS_autoliquidazione_AAAA.pdf", "06", true, "manuale", "annuale", DR, true],
    ["F24 Premio INAIL - quietanza", "F24 premio INAIL, tutte le rate", "solo PDF", "PERS_PS_INAIL_AAAA.pdf", "07", true, "manuale", "annuale", DR, true],
    ["Visura camerale", "Visura camerale recente", "PDF", "PROFESSIONAL SOLUTIONS_VISURA_scad. GG.MM.AA.pdf", "08", true, "fine_M+1", "trimestrale", DR, true],
    ["Dilazioni", "Domanda di dilazione + accettazione + piano", "PDF", "", "09", true, "fine_M+1", "solo_se_presente", DR, false],
    ["F24 Dilazioni - quietanza", "F24 quietanzato delle rate", "solo PDF", "", null, true, "fine_M+1", "solo_se_presente", DR, false],
    ["LUL_Riepilogo LUL", "LUL vidimato e numerato + riepilogo paghe (Cedolone), PDF originale", "solo PDF", "LUL_PS_<DS>_MMAA.pdf + Cedolone_MMAA.pdf", "11", true, "fine_M+1", "mensile", DR, true],
    ["Attestazione pagamento EBILOG", "Distinta bonifico Ebilog + estratto conto Ebilog", "solo PDF", "EBILOG_bonifico_Qn_AAAA.pdf, EBILOG_estratto-conto_GGMMAAAA.pdf", "12", true, "fine_M+1", "trimestrale", DR, true, "1,4,7,10"],
    ["Attestazione pagamento SANILOG", "Videata portale Sanilog con pagato/dovuto e semaforo", "solo PDF", "SANILOG_videata_AAAAMM.pdf", "13", true, "fine_M+1", "semestrale", DR, true, "5,11"],
    ["TRC payroll file", "Template Excel Amazon, struttura invariata", "xlsx", "TRC File Payroll - DSP 1.0 - <MESE>_Sic.xlsx", "14", false, "fine_M+1", "mensile", DR, true],
    ["Elenco del Personale", "Excel da template del portale", "xlsx", "template portale", "15", false, "fine_M+1", "mensile", AL, true],
    ["Attestazioni di pagamento retribuzioni", "Distinte bonifici stipendi con data e stato ESEGUITA", "PDF", "<DS>_Certificazione SIC_MMAA.pdf", "16", false, "fine_M+1", "mensile", DR, true],
    ["Varie – WHC", "Working Hours Compliance, template Amazon", "xlsx", "WHC_IT_PROF_<MESE>AAAA.xlsx", null, false, "20_M+1", "mensile", AL, true],
  ]),
  ...t("ADECCO", "Giuslavoro", [
    ["DM10 virtuale", "Ricevuta DM10 virtuale", "PDF", "DM10_<matricola>_AAAAMM.pdf", "01", true, "15_M+2", "mensile", CF, true],
    ["UNIEMENS", "Ricevuta trasmissione UNIEMENS", "PDF", "RicevutaTrasmissione_<n>.pdf", "02", true, "15_M+2", "mensile", CF, true],
    ["F24 INPS IRPEF - quietanza", "F24 quietanzato", "solo PDF", "SSC_AI_DM10_AAAAMM F24 INPS <MESE> AAAA.pdf", "03", true, "fine_M+1", "mensile", CF, true],
    ["D.U.R.C. online", "DURC valido", "PDF", "Durc_ADE IT valido fino GG.MM.AA.pdf", "04", true, "manuale", "a_scadenza", CF, true],
    ["Cassetto Previdenziale INPS", "Cassetto Previdenziale, unico PDF", "PDF", "Cassetto Previdenziale_ADECCO_MMAAAA.pdf", "05", true, "fine_M+1", "trimestrale", CF, true],
    ["INAIL", "Denuncia INAIL", "PDF", "Denuncia trimestrale Inail AAAA.pdf", "06", true, "fine_M+1", "mensile", CF, true],
    ["F24 Premio INAIL - quietanza", "F24 premio INAIL", "solo PDF", "SSC_AI_INAIL_MMAA_STD.pdf, _SL.pdf", "07", true, "fine_M+1", "mensile", CF, true],
    ["Visura camerale", "Visura recente", "PDF", "ADECCO ITALIA_Visura_AAMMGG.pdf", "08", true, "fine_M+1", "trimestrale", CF, true],
    ["Dilazioni", "Solo se esistono dilazioni", "PDF", "", "09", true, "fine_M+1", "solo_se_presente", CF, false],
    ["F24 Dilazioni - quietanza", "Solo se esistono dilazioni", "solo PDF", "", null, true, "fine_M+1", "solo_se_presente", CF, false],
    ["Autorizzazione Ministeriale", "Autorizzazione APL del Ministero del Lavoro", "PDF", "AI Autorizzazione Ministeriale.pdf", "A1", true, "manuale", "annuale", CF, true],
    ["TRC payroll file", "Template Excel Amazon", "xlsx", "TRC payroll file template DSP 1.0 <MESE> AAAA_STD.xlsx", "14", false, "fine_M+1", "mensile", "Referente TRC Adecco", true],
    ["Elenco del Personale", "Excel da template portale", "xlsx", "template portale", "15", false, "fine_M+1", "mensile", AL, true],
    ["LUL", "Buste paga + presenze, LUL numerato e vidimato", "PDF", "LUL_ADECCO_<DS>_MMAA.pdf", "A2", false, "fine_M+1", "mensile", CF, true],
    ["Attestazioni di pagamento retribuzioni", "Distinte bonifici stipendi", "PDF", "<DS>_Certificazione STD_MMAA.pdf", "16", false, "fine_M+1", "mensile", CF, true],
  ]),
  ...t("PS", "Fiscale", [
    ["DURF", "DURF in corso di validità", "PDF", "", null, true, "manuale", "a_scadenza", DR, true],
    ["Elenco del Personale", "Excel elenco personale fiscale", "xlsx", "", null, true, "manuale", "solo_se_presente", DR, false],
    ["Deleghe F24 per committente", "Deleghe F24", "PDF", "", null, true, "manuale", "solo_se_presente", DR, false],
    ["Riepilogo paghe", "Riepilogo paghe", "PDF", "", null, true, "manuale", "solo_se_presente", DR, false],
  ]),
];

/** File dei fac-simile (cartella content/compliance/fac-simile), per codice. Il 15 ha template e istruzioni. */
export const FAC_SIMILE: Record<string, { file: string; nome: string }[]> = {
  "01": [{ file: "01_DM10 virtuale_fac-simile.pdf", nome: "DM10 virtuale" }], "02": [{ file: "02_UNIEMENS_fac-simile.pdf", nome: "UNIEMENS" }],
  "03": [{ file: "03_F24 INPS IRPEF_fac-simile.pdf", nome: "F24 INPS IRPEF" }], "04": [{ file: "04_DURC_fac-simile.pdf", nome: "DURC" }],
  "05": [{ file: "05_Cassetto Previdenziale INPS_fac-simile.pdf", nome: "Cassetto Previdenziale INPS" }], "06": [{ file: "06_INAIL autoliquidazione_fac-simile.pdf", nome: "INAIL autoliquidazione" }],
  "07": [{ file: "07_F24 Premio INAIL_fac-simile.pdf", nome: "F24 Premio INAIL" }], "08": [{ file: "08_Visura camerale_fac-simile.pdf", nome: "Visura camerale" }],
  "09": [{ file: "09_Dilazioni INPS INAIL_fac-simile.pdf", nome: "Dilazioni INPS INAIL" }], "11": [{ file: "11_LUL_Riepilogo LUL_fac-simile.pdf", nome: "LUL e Riepilogo LUL" }],
  "12": [{ file: "12_Attestazione pagamento EBILOG_fac-simile.pdf", nome: "Attestazione EBILOG" }], "13": [{ file: "13_Attestazione pagamento SANILOG_fac-simile.pdf", nome: "Attestazione SANILOG" }],
  A1: [{ file: "A1_Autorizzazione Ministeriale_fac-simile.pdf", nome: "Autorizzazione Ministeriale" }], A2: [{ file: "A2_LUL no workflow_fac-simile.pdf", nome: "LUL (Adecco)" }],
  "14": [{ file: "14_TRC payroll file_template.xlsx", nome: "TRC payroll file (template)" }],
  "15": [{ file: "15_Elenco del Personale_template.xlsx", nome: "Elenco del Personale (template)" }, { file: "15_Elenco del Personale_istruzioni.pdf", nome: "Elenco del Personale (istruzioni)" }],
  "16": [{ file: "16_Attestazioni pagamento retribuzioni_fac-simile.pdf", nome: "Attestazioni pagamento retribuzioni" }],
};

type Iniziale = { entita: "PS" | "ADECCO"; area?: "Fiscale"; anno: number; mese: number; folder: string; stato: Stato; scadenzaPortale?: string; motivo?: string };
const piu = (entita: "PS" | "ADECCO", mese: number, stato: Stato, folder: string[]): Iniziale[] => folder.map((f) => ({ entita, anno: 2026, mese, folder: f, stato }));

/** Stato letto dal portale il 27/11/2026: quello che non è qui nasce DA_RICHIEDERE (o NON_APPLICABILE se il folder non si usa). */
export const STATO_INIZIALE: Iniziale[] = [
  ...piu("PS", 10, "VALIDATO", ["D.U.R.C. online", "INAIL", "F24 Premio INAIL - quietanza"]), ...piu("PS", 10, "CARICATO", ["Varie – WHC"]),
  ...piu("ADECCO", 10, "VALIDATO", ["D.U.R.C. online", "Visura camerale", "Autorizzazione Ministeriale"]),
  ...piu("PS", 11, "VALIDATO", ["D.U.R.C. online", "INAIL", "F24 Premio INAIL - quietanza"]),
  ...piu("ADECCO", 11, "VALIDATO", ["D.U.R.C. online", "Autorizzazione Ministeriale"]),
  // Fiscale PS: a ottobre il DURF era verde (procedura, sezione 5); a novembre serve quello nuovo
  { entita: "PS", area: "Fiscale", anno: 2026, mese: 10, folder: "DURF", stato: "VALIDATO" },
  { entita: "PS", area: "Fiscale", anno: 2026, mese: 11, folder: "DURF", stato: "DA_RICHIEDERE", scadenzaPortale: "2027-03-23" },
];

/** Arretrati di agosto e settembre ancora aperti sul portale: nascono solo queste righe, con la scadenza letta. */
export const ARRETRATI: Iniziale[] = [
  { entita: "PS", anno: 2026, mese: 8, folder: "LUL_Riepilogo LUL", stato: "RESPINTO", scadenzaPortale: "2026-12-04", motivo: "FileNonConforme" },
  { entita: "PS", anno: 2026, mese: 9, folder: "LUL_Riepilogo LUL", stato: "RESPINTO", scadenzaPortale: "2026-11-30", motivo: "FileNonConforme" },
  ...["DM10 virtuale", "UNIEMENS", "F24 INPS IRPEF - quietanza"].map((folder): Iniziale => ({ entita: "PS", anno: 2026, mese: 9, folder, stato: "DA_RICHIEDERE", scadenzaPortale: "2026-11-30" })),
  ...["DM10 virtuale", "UNIEMENS", "F24 INPS IRPEF - quietanza", "Cassetto Previdenziale INPS", "INAIL", "F24 Premio INAIL - quietanza"].map((folder): Iniziale => ({ entita: "ADECCO", anno: 2026, mese: 9, folder, stato: "DA_RICHIEDERE", scadenzaPortale: "2026-11-30" })),
];
