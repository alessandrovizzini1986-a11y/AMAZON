/**
 * Foglio "Stima Costi" di metà mese, nello stesso formato del file che si allega alla mail (un foglio per mese):
 * stesse celle e stesse formule, così il foglio si copia nel file storico. Rispetto ai fogli fatti a mano:
 * giorni del mese sempre giusti, GLS somministrati dentro il totale GLS, trasferte GLS sommate come giorni.
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
  const grassetto = (...refs: string[]) => { for (const r of refs) ws.getCell(r).font = { bold: true }; };
  const ORE = "#,##0.##", EUR = "#,##0.00";
  const [a, m] = s.mese.split("-");
  const zero = (o: OreMeta | null, v: keyof OreMeta) => o?.[v] ?? 0;

  set("A1", `al ${String(s.giorno).padStart(2, "0")}-${m}-${a.slice(2)}`); set("B1", s.giorno); set("C1", s.giorniMese);
  STATION_ORDINE.forEach((st, i) => { set(`${COL[i]}1`, st); set(`${COL[i]}16`, st); set(`${COL[i]}31`, st); });
  set("M1", "GLS"); set("N1", "GLS costo");
  for (const [r, titolo] of [[2, "Costi SIC"], [17, "Costi STD"]] as const) {
    set(`A${r}`, titolo); set(`B${r}`, "HH"); set(`C${r}`, "Costo tot"); set(`D${r}`, "COSTO/H");
    for (const c of [...COL, "M"]) set(`${c}${r}`, "HH");
    set(`N${r}`, "Costo");
  }
  set("M16", "GLS somministrati");

  // ── SIC: righe 3–14 (12 voci), costo sulle prime 8
  VOCI_META.forEach((v, i) => {
    const r = 3 + i;
    set(`A${r}`, ETICHETTE_META[v]); set(`B${r}`, f(`SUM(E${r}:K${r})`), ORE);
    STATION_ORDINE.forEach((st, j) => set(`${COL[j]}${r}`, s.sic[st]?.[v] ?? 0, ORE));
    set(`M${r}`, zero(s.glsSic, v), ORE);
    if (i < 8) {
      set(`D${r}`, s.costi[v as VoceCosto], EUR); set(`C${r}`, f(`B${r}*D${r}`), EUR);
      set(`N${r}`, v === "trasfOrd" || v === "trasfDom" ? f(`M${r}*${s.costi.trasfGls}`) : f(`D${r}*M${r}`), EUR);
    }
  });
  set("A15", "SIC variabile: al giorno / totale"); set("B15", f("C15/$B$1"), EUR); set("C15", f("SUM(C4:C10)"), EUR);
  set("A16", "SIC variabile: mese intero"); set("C16", f("B15*$C$1"), EUR); set("D16", f("C16/3*4"), EUR);
  set("M15", "GLS dipendenti"); set("N15", f("SUM(N3:N10)"), EUR);

  // ── STD: righe 18–25 (8 voci)
  VOCI_COSTO.forEach((v, i) => {
    const r = 18 + i;
    set(`A${r}`, ETICHETTE_META[v]); set(`B${r}`, f(`SUM(E${r}:K${r})`), ORE); set(`C${r}`, f(`B${r}*D${r}`), EUR); set(`D${r}`, f(`D${3 + i}`), EUR);
    STATION_ORDINE.forEach((st, j) => set(`${COL[j]}${r}`, s.std[st]?.[v] ?? 0, ORE));
    set(`M${r}`, zero(s.glsStd, v), ORE);
    set(`N${r}`, v === "trasfOrd" || v === "trasfDom" ? f(`M${r}*${s.costi.trasfGls}`) : f(`D${r}*M${r}`), EUR);
  });
  set("A26", "STD: totale al giorno della stima"); set("C26", f("SUM(C18:C25)"), EUR);
  set("A27", "STD: al giorno"); set("C27", f("C26/$B$1"), EUR);
  set("A28", "STD: mese intero"); set("C28", f("C27*$C$1"), EUR); set("D28", f("(C28/3)*4"), EUR);
  set("M26", "GLS somministrati"); set("N26", f("SUM(N18:N25)"), EUR);
  set("M27", "GLS totale al giorno"); set("N27", f("N15+N26"), EUR);
  set("M28", "GLS mese intero"); set("N28", f("N27/$B$1*$C$1"), EUR); set("O28", f("N28/3*4"), EUR);

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
    for (const c of COL) set(`${c}${r}`, f(per(c)), ORE);
    set(`L${r}`, f(`SUM(E${r}:K${r})`), ORE); set(`N${r}`, f(gls), ORE);
  }

  // ── totali da mettere nella mail
  set("A38", "TOTALI STIMATI DEL MESE"); set("B38", "al giorno della stima"); set("C38", "mese intero"); set("D38", "mese intero /3 ×4");
  set("A39", "Amazon SIC (variabile)"); set("B39", f("C15"), EUR); set("C39", f("C16"), EUR); set("D39", f("D16"), EUR);
  set("A40", "Amazon STD"); set("B40", f("C26"), EUR); set("C40", f("C28"), EUR); set("D40", f("D28"), EUR);
  set("A41", "GLS (dipendenti + somministrati)"); set("B41", f("N27"), EUR); set("C41", f("N28"), EUR); set("D41", f("O28"), EUR);

  grassetto("A1", "A2", "A17", "A38", "C16", "D16", "C28", "D28", "N28", "O28", "M1", ...COL.flatMap((c) => [`${c}1`, `${c}16`, `${c}31`]));
  const larghezze: Record<string, number> = { A: 34, B: 14, C: 16, D: 17, L: 11, M: 22, N: 14, O: 14 };
  for (const c of COL) larghezze[c] = 10;
  for (const [c, w] of Object.entries(larghezze)) ws.getColumn(c).width = w;
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 2 }];
  return wb;
}
