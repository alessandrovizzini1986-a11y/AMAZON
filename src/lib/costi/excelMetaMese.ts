/**
 * Foglio "Stima Costi" di metà mese, nello stesso formato del file che si allega alla mail (un foglio per mese):
 * stesse celle e stesse formule, così il foglio si copia nel file storico. Rispetto ai fogli fatti a mano:
 * giorni del mese sempre giusti, GLS somministrati dentro il totale GLS, trasferte GLS sommate come giorni.
 * Colori, grassetti, formati e larghezze sono quelli del foglio Ott_26.
 */
import ExcelJS from "exceljs";
import { ETICHETTE_META, VOCI_COSTO, VOCI_META, type OreMeta, type StimaMeta, type VoceCosto } from "@/domain/costi/metaMese";
import { STATION_ORDINE } from "./excelStimaPersonale";

const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Sett", "Ott", "Nov", "Dic"];
export const nomeFoglioMeta = (mese: string) => `${MESI[Number(mese.slice(5, 7)) - 1]}_${mese.slice(2, 4)}`;
const COL = ["E", "F", "G", "H", "I", "J", "K"];

export function excelMetaMese(s: StimaMeta): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FleetDSP";
  wb.calcProperties.fullCalcOnLoad = true;
  const ws = wb.addWorksheet(nomeFoglioMeta(s.mese));
  const set = (ref: string, v: ExcelJS.CellValue, fmt?: string) => { const c = ws.getCell(ref); c.value = v; if (fmt) c.numFmt = fmt; };
  const f = (formula: string) => ({ formula });
  const EUR = '_-* #,##0.00\\ "€"_-;\\-* #,##0.00\\ "€"_-;_-* "-"??\\ "€"_-;_-@_-', EUR0 = '_-* #,##0\\ "€"_-;\\-* #,##0\\ "€"_-;_-* "-"??\\ "€"_-;_-@_-';
  const [a, m] = s.mese.split("-");
  const zero = (o: OreMeta | null, v: keyof OreMeta) => o?.[v] ?? 0;

  set("A1", `al ${String(s.giorno).padStart(2, "0")}-${m}-${a.slice(2)}`); set("B1", s.giorno); set("C1", s.giorniMese);
  STATION_ORDINE.forEach((st, i) => { set(`${COL[i]}1`, st); set(`${COL[i]}16`, st); set(`${COL[i]}31`, st); });
  set("M1", "GLS");
  for (const [r, titolo] of [[2, "Costi SIC"], [17, "Costi STD"]] as const) {
    set(`A${r}`, titolo); set(`B${r}`, "HH"); set(`C${r}`, "Costo tot"); set(`D${r}`, "COSTO/H");
    for (const c of COL) set(`${c}${r}`, "HH");
  }
  set("M2", "HH");

  // ── SIC: righe 3–14 (12 voci), costo sulle prime 8
  VOCI_META.forEach((v, i) => {
    const r = 3 + i;
    set(`A${r}`, ETICHETTE_META[v]); set(`B${r}`, f(`SUM(E${r}:K${r})`));
    STATION_ORDINE.forEach((st, j) => set(`${COL[j]}${r}`, s.sic[st]?.[v] ?? 0, r === 11 || r === 12 ? "0.00" : undefined));
    set(`M${r}`, zero(s.glsSic, v));
    if (i < 8) {
      set(`D${r}`, s.costi[v as VoceCosto], EUR); set(`C${r}`, f(`B${r}*D${r}`), EUR);
      set(`N${r}`, v === "trasfOrd" || v === "trasfDom" ? f(`M${r}*${s.costi.trasfGls}`) : f(`D${r}*M${r}`), EUR);
    }
  });
  set("B15", f("C15/$B$1"), EUR); set("C15", f("SUM(C4:C10)"), EUR);
  set("C16", f("B15*$C$1"), EUR0); set("D16", f("C16/3*4"), EUR0);
  set("N15", f("SUM(N3:N10)"), EUR);
  // GLS mese intero: dipendenti + somministrati, nelle stesse celle dei fogli precedenti
  set("N17", f("(N15+N26)/B1*C1"), EUR); set("O17", f("N17/3*4"), EUR);

  // ── STD: righe 18–25 (8 voci)
  VOCI_COSTO.forEach((v, i) => {
    const r = 18 + i;
    set(`A${r}`, ETICHETTE_META[v]); set(`B${r}`, f(`SUM(E${r}:K${r})`)); set(`C${r}`, f(`B${r}*D${r}`), EUR); set(`D${r}`, f(`D${3 + i}`), EUR);
    STATION_ORDINE.forEach((st, j) => set(`${COL[j]}${r}`, s.std[st]?.[v] ?? 0));
    set(`M${r}`, zero(s.glsStd, v));
    set(`N${r}`, v === "trasfOrd" || v === "trasfDom" ? f(`M${r}*${s.costi.trasfGls}`) : f(`D${r}*M${r}`), EUR);
  });
  set("C26", f("SUM(C18:C25)"), EUR); set("C27", f("C26/$B$1"), EUR);
  set("C28", f("C27*$C$1"), EUR0); set("D28", f("(C28/3)*4"), EUR0);
  set("M26", "GLS somministrati"); set("N26", f("SUM(N18:N25)"), EUR);

  // ── riepilogo ore, ferie, malattie, trasferte
  const riep: [number, string, (c: string) => string, string][] = [
    [32, "ORE LAVORATE", (c) => `SUM(${c}3:${c}8,${c}18:${c}23)`, "SUM(M3:M8,M18:M23)"],
    [33, "FERIE", (c) => `${c}11`, "M11"],
    [34, "MALATTIE", (c) => `${c}12`, "M12"],
    [35, "TRASFERTE", (c) => `SUM(${c}9:${c}10,${c}24:${c}25)`, "SUM(M9:M10,M24:M25)"],
  ];
  set("N31", "GLS");
  for (const [r, nome, per, gls] of riep) {
    set(`D${r}`, nome); set(`M${r}`, nome);
    for (const c of COL) set(`${c}${r}`, f(per(c)), r === 32 ? "0" : undefined);
    set(`L${r}`, f(`SUM(E${r}:K${r})`), "0"); set(`N${r}`, f(gls), r === 32 ? "0" : undefined);
  }

  // ── totali da mettere nella mail (sotto, fuori dalle celle dei fogli precedenti)
  set("A38", "TOTALI STIMATI DEL MESE"); set("B38", "al giorno"); set("C38", "mese intero"); set("D38", "mese intero /3 ×4");
  set("A39", "Amazon SIC (variabile)"); set("B39", f("C15"), EUR); set("C39", f("C16"), EUR); set("D39", f("D16"), EUR);
  set("A40", "Amazon STD"); set("B40", f("C26"), EUR); set("C40", f("C28"), EUR); set("D40", f("D28"), EUR);
  set("A41", "GLS (dip. + somm.)"); set("B41", f("N15+N26"), EUR); set("C41", f("N17"), EUR); set("D41", f("O17"), EUR);

  // ── formattazione uguale ai fogli fatti a mano (colori del tema, grassetti, altezze, larghezze)
  const tema = (theme: number, tint: number): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { theme, tint } as unknown as ExcelJS.Color });
  const pieno = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const T80 = 0.7999816888943144;
  const coloriStation: ExcelJS.Fill[] = [tema(5, T80), tema(5, T80), tema(7, T80), tema(9, T80), tema(4, T80), tema(0, -0.0499893185216834), pieno("FFD5B8EA")];
  const font = (ref: string, x: Partial<ExcelJS.Font>) => { ws.getCell(ref).font = { name: "Calibri", size: 11, ...x }; };
  const centro = (ref: string) => { ws.getCell(ref).alignment = { horizontal: "center" }; };
  ws.eachRow((row) => row.eachCell((c) => { c.font = { name: "Calibri", size: 11 }; }));
  for (const r of ["A1", "B1", "C1", "C16", "D16", "C28"]) font(r, { bold: true, size: 14 });
  for (const r of ["A2", "B2", "C2", "D2", "A17", "B17", "C17", "D17", "D28", "A38"]) font(r, { bold: true });
  COL.forEach((c, i) => {
    for (const r of [1, 16, 31]) { ws.getCell(`${c}${r}`).fill = coloriStation[i]; font(`${c}${r}`, { bold: true, size: 14 }); centro(`${c}${r}`); }
    for (const r of [2, 17]) { ws.getCell(`${c}${r}`).fill = coloriStation[i]; font(`${c}${r}`, { bold: true, size: 10 }); centro(`${c}${r}`); }
  });
  for (const r of ["M1", "N31"]) { ws.getCell(r).fill = pieno("FF0070C0"); font(r, { bold: true, color: { theme: 0 } as unknown as ExcelJS.Color }); centro(r); }
  ws.getCell("M2").fill = tema(7, 0.5999938962981048); font("M2", { bold: true, size: 10 }); centro("M2");
  for (let r = 3; r <= 25; r++) ws.getCell(`M${r}`).fill = pieno("FFFFFF00");
  ws.getCell("O17").fill = pieno("FFFFFF00"); font("O17", { bold: true });
  for (const r of [1, 16, 28, 31]) ws.getRow(r).height = 18.75;
  const larghezze: Record<string, number> = { A: 22.43, B: 12.57, C: 16.43, D: 17.14, E: 8.71, F: 8.71, G: 8.71, H: 8.71, I: 9.14, J: 9.14, K: 9.14, L: 9.14, M: 14.43, N: 13.14, O: 22 };
  for (const [c, w] of Object.entries(larghezze)) ws.getColumn(c).width = w;
  return wb;
}
