/**
 * Fogli "MM_AA" (Costi F.O. GLS) e "MMAA_ft" (fatturazione open book) con la struttura di GLS_Costi_F.O._2026.xlsx,
 * compilati dal sito: si spostano nel file con "Sposta o copia foglio". Celle gialle = dati dal sito.
 * Regole: docs/costi-kit/PROMPT_GLS_mensile.md §1–2.
 *  - P60 TOT. COSTO SIC = busta SIC pagata nel mese (P58) − accantonamenti del mese prima + accantonamenti del mese
 *    (come il F.O. Amazon); P61 = stima STD di competenza.
 *  - _ft del mese: a1 = P60+P61 del mese prima, a2 = P62 e a3 = P63 del mese prima, a4 = D53 di due mesi prima;
 *    b e c = teste attive × 129,25 / 37,42; d = 7 %; e = 6,5 %. P71 FATTURATO = totale del foglio _ft.
 */
import ExcelJS from "exceljs";

export type CellaNoleggioGls = { riga: number; importo: number; mezzi: number; societa: string[] };
export type InputFOGls = {
  mese: string;
  carburante: number | null; elettrico: number | null; noleggi: CellaNoleggioGls[]; danni: number; autostrade: number | null;
  wind: number; elmec: number;
  accStraord: number | null; accFerie: number | null;
  bustaSic: number | null; bustaNota: string; trasferta: number | null;
  bustaVoci?: { etichetta: string; importo: number }[] | null;
  costoStd: number | null; stdNota: string;
  teste: number;
};

/** Nomi dei fogli del file F.O. GLS: luglio–settembre 2026 hanno uno spazio in fondo. */
const CON_SPAZIO_FO = new Set(["2026-07", "2026-08", "2026-09"]);
const mm = (mese: string) => mese.slice(5, 7), aa = (mese: string) => mese.slice(2, 4);
export const foglioFOGls = (mese: string) => `${mm(mese)}_${aa(mese)}${CON_SPAZIO_FO.has(mese) ? " " : ""}`;
const meseMeno = (mese: string, n: number) => { const [a, m] = mese.split("-").map(Number); const d = new Date(Date.UTC(a, m - 1 - n, 1)); return d.toISOString().slice(0, 7); };

/** Riga del foglio F.O. GLS per società di noleggio (riga 6 Arval; le società non previste vanno in 17 con nota). */
export function rigaNoleggioGls(societa: string | null): number {
  const s = (societa ?? "").toUpperCase().trim();
  if (s.startsWith("ARVAL")) return 6;
  if (s.startsWith("TORENTAL")) return 8;
  if (s.startsWith("AVIS") || s.includes("AMICOBLU") || s.includes("MAGGIORE")) return 9;
  if (s.startsWith("EUROPCAR")) return 10;
  if (s.startsWith("NOLEGGIARE")) return 11;
  if (s.startsWith("LOCAUTO")) return 12;
  if (s.startsWith("HERTZ") || s.startsWith("HERZ")) return 13;
  if (s.startsWith("AUTOVIA")) return 14;
  if (s === "ALD MT" || s.startsWith("ALD MT") || s === "AYVENS MT") return 15;
  if (s.startsWith("ALD") || s.startsWith("AYVENS")) return 16;
  return 17;
}

const ETICHETTE: [number, string][] = [
  [3, "Carburante"], [4, "Canone Tessere Q8"], [5, "Carburante Elettrico"], [6, "Arval"], [7, "Arval Scaduti"], [8, "TORENTAL"], [9, "Avis"], [10, "Europcar"], [11, "Noleggiare"], [12, "Locauto"],
  [13, "Hertz"], [14, "Autovia"], [15, "Ald MT"], [16, "Ald"], [17, "VEM"], [18, "DANNI"], [19, "Edilferro srl"], [20, "Parcheggio Brescia"], [21, "Parcheggio Geni.o srl"], [22, "Veneta Investimenti S.A.S"],
  [23, "Francesco Colonna"], [24, "Autolavaggio Pinguino - Nati srl"], [25, "Rokowash"], [26, "Tecnowash"], [27, "Topwash"], [28, "Totaljob"], [29, "Abdellatif Hazem Helsayed Moustafa"], [30, "Roblumauto"],
  [31, "Bottari"], [32, "Carsessa"], [33, "PIEFFE FILTRI E BATTERIE "], [34, "Zampieron Tiziano"], [35, "Cacciari Tonnelli"], [36, "Autofficina Pontina"], [37, "FAM batterie"], [38, "Multe(gestite tesoreria)"],
  [39, "Multe 2025"], [40, "Multe 2026"], [41, "DPI (rovetta)"], [42, "DPI (Marchesi)"], [43, "Abbigliamento (Rovetta)"], [44, "Projit (VM)"], [45, "Projit(Formaz. Gen)"], [46, "Formazioni specifiche SIRLAV"],
  [47, "Visite mediche (Remark)"], [48, "Visite mediche (Cosma - Milano)"], [49, "Visite mediche (Cesarano - Pomezia)"], [50, "Visite mediche (Ruzza)"], [51, "Visite mediche (Stranges)"], [52, "Visite mediche (Smao)"],
  [53, "Autostrade per l'Italia"], [54, "PARCHEGGI"], [55, "Ztl (Area C)"], [56, "Canone telepass"], [57, "Aeroporto G.Marconi Bologna"], [58, "Wind"], [59, "Elmec"], [60, "Accantonam. Straordinari + Supplementari"],
  [61, "Accantonamento Ferie & Permessi"], [63, "Transpallet manuali rs"], [64, "Transpallet manuali doppia ruota"], [65, "BOMOB"], [66, "Amazon"], [67, "Materiali COVID -19 (mascherine)"],
  [68, "Edenred (ticket compliments)"], [69, "Office Depot (cancelleria + DPI)"],
];

const giallo: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
const eur = "#,##0.00";
const r2 = (v: number) => Math.round(v * 100) / 100;
const q = (nome: string) => `'${nome}'`;

export function excelFOGls(x: InputFOGls): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FleetDSP";
  wb.calcProperties.fullCalcOnLoad = true;
  const nomeFO = foglioFOGls(x.mese).trimEnd(), nomeFt = `${mm(x.mese)}${aa(x.mese)}_ft`;
  const ws = wb.addWorksheet(nomeFO);
  const prev = q(foglioFOGls(meseMeno(x.mese, 1)));
  const prev2 = q(foglioFOGls(meseMeno(x.mese, 2)));
  const set = (w: ExcelJS.Worksheet, ref: string, v: ExcelJS.CellValue, fmt?: string, yel = false) => { const c = w.getCell(ref); c.value = v; if (fmt) c.numFmt = fmt; if (yel) c.fill = giallo; };
  const f = (formula: string) => ({ formula });
  const S = (ref: string, v: ExcelJS.CellValue, fmt?: string, yel = false) => set(ws, ref, v, fmt, yel);

  S("C2", "Voci"); S("D2", "Castelmaggiore (BO)"); for (const c of ["E", "F", "G", "H", "I", "J"]) S(`${c}2`, "-"); S("K2", "NOTE");
  S("B3", "Fleet Management"); S("B58", "Devices"); S("B60", "Accantonamenti");
  for (const [r, l] of ETICHETTE) S(`C${r}`, l);

  if (x.carburante !== null) { S("D3", r2(x.carburante), eur, true); S("K3", "Q8: imponibile delle transazioni del mese, station GLS"); } else S("K3", "Q8 del mese non elaborato");
  S("L3", f("SUM(D3:J3)"), eur);
  if (x.elettrico !== null) { S("D5", r2(x.elettrico), eur, true); S("K5", "ricariche elettriche: valore inserito a mano"); }
  for (const c of x.noleggi) {
    S(`D${c.riga}`, r2(c.importo), eur, true);
    S(`K${c.riga}`, `flotta GLS: canone €/mese pro-rata sui giorni del mese, sostitutivi esclusi (${c.mezzi} mezzi${c.riga === 17 && c.societa.some((s) => !/^VEM/i.test(s)) ? ": " + c.societa.join(", ") : ""})`);
  }
  S("D18", x.danni, eur, true); S("K18", "danni: forfait mensile (parametro)");
  if (x.autostrade !== null) { S("D53", r2(x.autostrade), eur, true); S("K53", "Telepass: pedaggi del mese, station GLS"); } else S("K53", "Telepass del mese non elaborato");
  S("D58", x.wind, eur, true); S("D59", x.elmec, eur, true);
  if (x.accStraord !== null) S("D60", r2(x.accStraord), eur, true);
  if (x.accFerie !== null) S("D61", r2(x.accFerie), eur, true);
  S("M60", "SIC: straordinari e festività non godute del mese a costo SIC (€/h × oneri), pagati nella busta del mese dopo");
  S("M61", "SIC: saving ferie (gg × Saving FE) + ROL ed ExF (h × saving) del mese, dal CDL GLS");
  S("K60", f("SUM(D60:J60)"), eur); S("L60", f("K60"), eur);
  S("K61", f("SUM(D61:J61)"), eur); S("L61", f("K61"), eur);
  S("K68", f("SUM(D68:J68)"), eur);

  // riepilogo a destra (stesse celle del file)
  S("O57", "Trasferta"); if (x.trasferta !== null) S("P57", r2(x.trasferta), eur, true); S("Q57", "trasferte SIC nella busta del mese (giorni del mese prima × tariffa)");
  S("O58", "Busta SIC del mese"); if (x.bustaSic !== null) S("P58", r2(x.bustaSic), eur, true); S("Q58", x.bustaNota);
  S("O59", "DESCRIZIONE"); S("P59", "IMPORTO");
  S("O60", "TOT. COSTO SIC"); S("P60", f(`P58-${prev}!L60+${prev}!L61+K60-K61`), eur);
  S("Q60", `busta SIC pagata nel mese − straordinari del mese prima + ferie del mese prima + straordinari del mese − ferie del mese (richiama il foglio ${prev.replace(/'/g, "")})`);
  S("O61", "TOT. COSTO STD"); if (x.costoStd !== null) S("P61", r2(x.costoStd), eur, true); S("Q61", x.stdNota);
  S("O62", "MEZZI"); S("P62", f("SUM(D6:J17)"), eur);
  S("O63", "CARBURANTE"); S("P63", f("SUM(D3:J3)+SUM(D5:J5)"), eur);
  S("O64", "MULTE"); S("P64", f("SUM(D39:J40)"), eur);
  S("O65", "AUTOSTRADE"); S("P65", f("SUM(D53:J53)+SUM(D55:J55)"), eur);
  S("O66", "WIND+ELMEC"); S("P66", f("SUM(D58:J59)"), eur);
  S("O67", "DANNI+VARIE"); S("P67", f("D18+SUM(D62:D66)"), eur);
  S("O68", "Edenred"); S("P68", f("SUM(D68:J68)"), eur);
  S("O69", "Totale"); S("P69", f("SUM(P60:P68)"), eur);
  S("O71", "FATTURATO STIMATO"); S("P71", f(`'${nomeFt}'!C17`), eur); S("Q71", `totale del foglio ${nomeFt} (fattura open book del mese)`);
  S("O72", "ML"); S("P72", f("P71-P69"), eur);
  S("O73", "ML %"); S("P73", f("IFERROR(1-P69/P71,0)"), "0.00%");
  for (const ref of ["O60", "O69", "O71", "P69"]) ws.getCell(ref).font = { bold: true };

  if (x.bustaVoci?.length) {
    const r0 = 79;
    S(`C${r0 - 1}`, "Busta SIC del mese (P58): da cosa nasce"); ws.getCell(`C${r0 - 1}`).font = { bold: true };
    S(`C${r0}`, "Voce"); S(`D${r0}`, "Importo");
    x.bustaVoci.forEach((v, j) => { S(`C${r0 + 1 + j}`, v.etichetta); S(`D${r0 + 1 + j}`, r2(v.importo), eur); });
    const rt = r0 + 1 + x.bustaVoci.length;
    S(`C${rt}`, "= Busta del mese"); S(`D${rt}`, f(`SUM(D${r0 + 1}:D${rt - 1})`), eur);
    S(`C${rt + 1}`, "Controllo: Totale − P58 (deve essere 0)"); S(`D${rt + 1}`, f(`ROUND(D${rt}-P58,2)`), eur);
    ws.getCell(`C${rt}`).font = { bold: true }; ws.getCell(`D${rt}`).font = { bold: true };
  }
  S("C75", "Compilato da FleetDSP (Costi GLS). Celle gialle = dati dal sito; le righe dei fornitori, multe, DPI e visite si compilano a mano.");
  ws.getColumn("B").width = 16; ws.getColumn("C").width = 42; ws.getColumn("D").width = 16; ws.getColumn("K").width = 60; ws.getColumn("M").width = 40;
  ws.getColumn("O").width = 22; ws.getColumn("P").width = 16; ws.getColumn("Q").width = 60;
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 2 }];

  // ── foglio _ft
  const ft = wb.addWorksheet(nomeFt);
  const T = (ref: string, v: ExcelJS.CellValue, fmt?: string, yel = false) => set(ft, ref, v, fmt, yel);
  T("A1", `Periodo open book: ${Number(mm(x.mese))} mesi`);
  T("A3", "#"); T("B3", "Voce di costo"); T("C3", "Modalità fatturazione"); T("D3", "PUD");
  T("A4", "a1"); T("B4", "Costo del lavoro (*)"); T("C4", f(`${prev}!P60+${prev}!P61`), eur); T("D4", "costi stimati");
  T("A5", "a2"); T("B5", "Mezzi di trasporto"); T("C5", f(`${prev}!P62`), eur); T("D5", "costi sostenuti");
  T("A6", "a3"); T("B6", "Carburante"); T("C6", f(`${prev}!P63`), eur); T("D6", "costi sostenuti");
  T("A7", "a4"); T("B7", "Pedaggi"); T("C7", f(`${prev2}!D53`), eur); T("D7", "costi sostenuti");
  T("A9", "b"); T("B9", "Costi accessori al personale (**)"); T("C9", f(`${x.teste}*129.25`), eur, true); T("D9", f("1551/12"), eur);
  T("A11", "c"); T("B11", "Costo delle attrezzature e materiali consumabili (***)"); T("C11", f(`${x.teste}*37.42`), eur, true); T("D11", f("449/12"), eur);
  T("A13", "d"); T("B13", "Costi generali di struttura organizzativa dell’Impresa Appaltatrice"); T("C13", f("SUM(C4:C11)*7%"), eur); T("D13", 0.07, "0%");
  T("A15", "e"); T("B15", "Margine lordo spettante all’Impresa Appaltatrice"); T("C15", f("SUM(C4:C13)*6.5%"), eur); T("D15", 0.065, "0.0%");
  T("B17", "Totale fattura"); T("C17", f("SUM(C4:C15)"), eur); ft.getCell("B17").font = { bold: true }; ft.getCell("C17").font = { bold: true };
  T("A18", "(*) Costo del lavoro calcolato sulla base del personale assunto o somministrato (CCNL Trasporti e Logistica) e dagli Accordi di Secondo Livello (p.e. premio, ticket restaurant, indennità di trasferta, etc.)");
  T("A20", "(**) formazione (es: sicurezza, etc.) prevista per legge e/o dalla contrattazione collettiva, DPI ed indumenti di lavoro, visite mediche, costo payroll (gestione amministrativa personale e predisposizione cedolini paga), assicurazione RCT ed RCO.");
  T("A22", "(***) costi sulla base delle attrezzature utilizzate presso la sede di Castel Maggiore e comunicati dal Committente al momento dell’entrata in vigore del Contratto, inclusi anche smartphone per drivers");
  T("A24", "Eventuali extra costi che potranno emergere verranno rifatturati previa condivisione ed autorizzazione da parte del Committente.");
  T("F9", `teste = ${x.teste} persone attive nell'Anagrafica del file presenze del mese (SIC e STD)`);
  T("F4", `a1, a2, a3 dal foglio ${prev.replace(/'/g, "")}; a4 (pedaggi) dal foglio ${prev2.replace(/'/g, "")}`);
  ft.getColumn("A").width = 6.6; ft.getColumn("B").width = 36; ft.getColumn("C").width = 21; ft.getColumn("D").width = 16;
  return wb;
}
