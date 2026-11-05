/**
 * Foglio "AMZ <Mmm> <AAAA>" con la struttura del file AMZ_Costi_F.O._2026.xlsx (righe 2–73, colonne B–P),
 * compilato dal sito: si sposta nel file F.O. con "Sposta o copia foglio". Celle gialle = dati dal sito,
 * celle vuote = voci da inserire a mano (fornitori, multe, DPI…).
 * Costo SIC (P60) = busta SIC pagata nel mese (P58: contiene già trasferte e straordinari del mese prima e
 * toglie le ferie godute) − accantonamenti del mese prima ('AMZ <mese prima>'!L60 / L61) + accantonamenti del
 * mese + PDR. Niente CDL base né trasferte a parte: sarebbero contati due volte.
 */
import ExcelJS from "exceljs";
import { DS_FO, foglioFO, mesePrima, type CellaNoleggio } from "@/domain/costi/fo";

export type InputFO = {
  mese: string;
  carburante: Record<string, number> | null;
  noleggi: CellaNoleggio[];
  telepass: Record<string, number> | null;
  ztl: { importo: number; permessi: number } | null;
  /** riga 60: € straordinari, supplementari, ore dom/festive e festività non godute SIC del mese per DS, a costo SIC (€/h SIC × oneri) */
  accStraord: Record<string, number> | null;
  /** riga 61: saving ferie/ROL/ExF SIC del mese per DS */
  accFerie: Record<string, number> | null;
  /** busta SIC pagata nel mese (payroll del mese, o stima SIC salvata del mese prima) */
  bustaSic: number | null; bustaNota: string;
  /** scomposizione della busta per DS (tabellina sotto il foglio) */
  bustaVoci?: { etichetta: string; perDs: Record<string, number> }[] | null;
  costoStd: number | null;
  fatturato: number | null; fatturatoNota: string;
  wind: number; elmec: number;
};

const ETICHETTE: [number, string][] = [
  [3, "Carburante"], [4, "Canone Tessere Q8"], [5, "Gabogas (Metano)"], [6, "Arval"], [7, "Arval Scaduti"], [8, "Arval MT"], [9, "Avis"], [10, "Europcar"], [11, "Noleggiare"],
  [12, "VEM"], [13, "Hertz"], [14, "Autovia"], [15, "Ald MT"], [16, "Ald"], [17, "Altri noleggi (NoloExpress, Locauto, Torental, Sixt…)"], [18, "Ferrari/Legnano (park Uboldo)"], [19, "Edilferro srl"], [20, "Parcheggio Brescia"],
  [21, "Parcheggio Geni.o srl"], [22, "Veneta Investimenti S.A.S"], [23, "Francesco Colonna"], [24, "Autolavaggio Pinguino - Nati srl"], [25, "Rokowash"], [26, "Tecnowash"], [27, "Topwash"],
  [28, "Totaljob"], [29, "Abdellatif Hazem Helsayed Moustafa"], [30, "Roblumauto"], [31, "Bottari"], [32, "Carsessa"], [33, "PIEFFE FILTRI E BATTERIE"], [34, "Zampieron Tiziano"], [35, "Cacciari Tonnelli"],
  [36, "Autofficina Pontina"], [37, "FAM batterie"], [38, "Multe(gestite tesoreria)"], [39, "Multe 2025"], [40, "Multe 2026"], [41, "DPI (rovetta)"], [42, "DPI (Marchesi)"], [43, "Abbigliamento (Rovetta)"],
  [44, "Projit (VM)"], [45, "Projit(Formaz. Gen)"], [46, "Formazioni specifiche SIRLAV"], [47, "Visite mediche (Remark)"], [48, "Visite mediche (Cosma - Milano)"], [49, "Visite mediche (Cesarano - Pomezia)"],
  [50, "Visite mediche (Ruzza)"], [51, "Visite mediche (Stranges)"], [52, "Visite mediche (Smao)"], [53, "Autostrade per l'Italia"], [54, "PARCHEGGI"], [55, "Ztl (Area C)"], [56, "Canone telepass"],
  [57, "Aeroporto G.Marconi Bologna"], [58, "Wind"], [59, "Elmec"], [60, "Accantonam. Straordinari + Supplementari"], [61, "Accantonamento Ferie & Permessi"], [62, "Materiali COVID -19 (Marchesi)"],
  [63, "Materiali COVID -19 (Fisiostore)"], [64, "Materiali COVID -19 (Unigum)"], [65, "Materiali COVID -19 (Igienpul)"], [66, "Amazon"], [67, "PDR UNA TANTUM ( CON 43% costo azienda)"],
  [68, "Edenred (ticket compliments)"], [69, "Office Depot (cancelleria + DPI)"],
];
const NOMI_DS: Record<string, string> = { DER1: "DER1 (Bologna)", DER2: "DER2 (Rimini)", DLO2: "DLO2 (Origgio)", DLO4: "DLO4 (Buccinasco)", DLO5: "DLO5 (Brescia)", DLZ2: "DLZ2 (Pomezia)", DVN1: "DVN1 (Padova)" };
const COL = ["D", "E", "F", "G", "H", "I", "J"];

export function excelFO(x: InputFO): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FleetDSP";
  wb.calcProperties.fullCalcOnLoad = true;
  const ws = wb.addWorksheet(foglioFO(x.mese));
  const prev = `'${foglioFO(mesePrima(x.mese))}'`;
  const giallo: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
  const eur = "#,##0.00";
  const set = (ref: string, v: ExcelJS.CellValue, fmt?: string, yel = false) => { const c = ws.getCell(ref); c.value = v; if (fmt) c.numFmt = fmt; if (yel) c.fill = giallo; };
  const f = (formula: string) => ({ formula });
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const perDs = (riga: number, valori: Record<string, number> | null, nota: string, colNota = "K") => {
    if (!valori) { set(`${colNota}${riga}`, `${nota}: dato non disponibile`); return; }
    DS_FO.forEach((ds, i) => { if (valori[ds]) set(`${COL[i]}${riga}`, r2(valori[ds]), eur, true); });
    set(`${colNota}${riga}`, nota);
  };

  set("C2", "Voci"); DS_FO.forEach((ds, i) => set(`${COL[i]}2`, NOMI_DS[ds])); set("K2", "NOTE");
  set("B3", "Fleet Management"); set("B58", "Devices"); set("B60", "Accantonamenti");
  for (const [r, l] of ETICHETTE) set(`C${r}`, l);

  perDs(3, x.carburante, "Q8: imponibile delle transazioni del mese per DS (Telepass e carburante → Q8)");
  set("L3", f("SUM(D3:J3)"), eur);
  for (const riga of [6, 9, 10, 11, 12, 13, 14, 15, 16, 17]) {
    const celle = x.noleggi.filter((c) => c.riga === riga);
    for (const c of celle) set(`${COL[DS_FO.indexOf(c.station as never)]}${riga}`, c.importo, eur, true);
    if (celle.length) set(`K${riga}`, `flotta: canone €/mese pro-rata sui giorni del mese, sostitutivi esclusi (${celle.reduce((s, c) => s + c.mezzi, 0)} mezzi${riga === 17 ? ": " + [...new Set(celle.flatMap((c) => c.societa))].join(", ") : ""})`);
  }
  perDs(53, x.telepass, "Telepass: pedaggi, parcheggi e Area C del mese per DS (Telepass e carburante → Telepass)");
  if (x.ztl) { set("E55", x.ztl.importo, eur, true); set("K55", `ZTL Rimini/Cesena su DER2: ${x.ztl.permessi} permessi richiesti nel mese`); }
  else set("K55", "ZTL Rimini/Cesena: carica il file TARGHE_ZTL per compilarla");
  DS_FO.forEach((_, i) => { set(`${COL[i]}58`, x.wind, eur, true); set(`${COL[i]}59`, x.elmec, eur, true); });
  perDs(60, x.accStraord, "SIC: straordinari, supplementari, ore dom/festive e festività non godute del mese a costo SIC (€/h SIC × oneri)", "M");
  perDs(61, x.accFerie, "SIC: saving ferie (gg × Saving FE) + ROL e ExF (h × costo rateo) con l'ultima anagrafica CDL", "M");
  set("K60", f("SUM(D60:J60)"), eur); set("L60", f("K60"), eur);
  set("K61", f("SUM(D61:J61)"), eur); set("L61", f("K61"), eur);
  set("K67", f("SUM(D67:J67)"), eur); set("K68", f("SUM(D68:J68)"), eur);

  // riepilogo a destra
  set("O58", "Busta SIC del mese"); if (x.bustaSic !== null) set("P58", r2(x.bustaSic), eur, true); set("Q58", x.bustaNota);
  set("O59", "DESCRIZIONE"); set("P59", "IMPORTO");
  set("O60", "TOT. COSTO SIC"); set("P60", f(`P58-${prev}!L60+${prev}!L61+K60-K61+K67`), eur);
  set("Q60", `busta SIC pagata nel mese − straordinari del mese prima + ferie del mese prima + straordinari del mese − ferie del mese + PDR (richiama il foglio ${prev.replace(/'/g, "")}). Le trasferte sono già nella busta.`);
  set("O61", "TOT. COSTO STD"); if (x.costoStd !== null) set("P61", r2(x.costoStd), eur, true); set("Q61", "stima STD di competenza del mese (Costi a fine mese)");
  set("O62", "MEZZI"); set("P62", f("SUM(D6:J17)"), eur);
  set("O63", "CARBURANTE"); set("P63", f("SUM(D3:J3)"), eur);
  set("O64", "MULTE"); set("P64", f("SUM(D39:J40)"), eur);
  set("O65", "AUTOSTRADE"); set("P65", f("SUM(D53:J55)"), eur);
  set("O66", "WIND+ELMEC"); set("P66", f("SUM(D58:J59)"), eur);
  set("O67", "DANNI+VARIE");
  set("O68", "Edenred"); set("P68", f("K68"), eur);
  set("O69", "Totale"); set("P69", f("SUM(P60:P68)"), eur);
  set("O71", "FATTURATO STIMATO"); if (x.fatturato !== null) set("P71", r2(x.fatturato), eur, true); set("Q71", x.fatturatoNota);
  set("O72", "ML"); set("P72", f("P71-P69"), eur);
  set("O73", "ML %"); set("P73", f("IFERROR(1-P69/P71,0)"), "0.00%");
  for (const ref of ["O60", "O69", "O71", "P69"]) ws.getCell(ref).font = { bold: true };

  // tabellina: da cosa nasce la busta SIC (P58)
  if (x.bustaVoci?.length) {
    const r0 = 79;
    set(`C${r0 - 1}`, "Busta SIC del mese (P58): da cosa nasce"); ws.getCell(`C${r0 - 1}`).font = { bold: true };
    set(`C${r0}`, "Voce"); DS_FO.forEach((ds, i) => set(`${COL[i]}${r0}`, ds)); set(`K${r0}`, "senza DS"); set(`L${r0}`, "Totale");
    x.bustaVoci.forEach((v, j) => {
      const r = r0 + 1 + j;
      set(`C${r}`, v.etichetta);
      DS_FO.forEach((ds, i) => set(`${COL[i]}${r}`, r2(v.perDs[ds] ?? 0), eur));
      const altro = Object.entries(v.perDs).filter(([k]) => !(DS_FO as readonly string[]).includes(k)).reduce((a, [, n]) => a + n, 0);
      if (altro) set(`K${r}`, r2(altro), eur);
      set(`L${r}`, f(`SUM(D${r}:K${r})`), eur);
    });
    const rt = r0 + 1 + x.bustaVoci.length;
    set(`C${rt}`, "= Busta del mese"); for (const c of [...COL, "K", "L"]) set(`${c}${rt}`, f(`SUM(${c}${r0 + 1}:${c}${rt - 1})`), eur);
    set(`C${rt + 1}`, "Controllo: Totale − P58 (deve essere 0)"); set(`L${rt + 1}`, f(`ROUND(L${rt}-P58,2)`), eur);
    for (const c of ["C", ...COL, "K", "L"]) ws.getCell(`${c}${rt}`).font = { bold: true };
  }

  set("C75", "Compilato da FleetDSP (Costi a fine mese). Celle gialle = dati dal sito; le celle vuote nelle righe dei fornitori, multe, DPI, PDR e danni si compilano a mano.");
  set("C76", "Riga 17 nuova: altre società di noleggio (nel modello non c'era una riga). P62 MEZZI somma D6:J17.");
  ws.getColumn("B").width = 16; ws.getColumn("C").width = 42; for (const c of COL) ws.getColumn(c).width = 14;
  ws.getColumn("K").width = 60; ws.getColumn("O").width = 22; ws.getColumn("P").width = 16; ws.getColumn("Q").width = 60;
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 2 }];
  return wb;
}
