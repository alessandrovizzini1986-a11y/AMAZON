/**
 * File completo delle fatture di un anno, scaricabile dal sito: tutte le righe nelle 16 colonne di fatt_AAAA,
 * l'elenco delle fatture e le righe di anni precedenti fatturate in quell'anno (vanno nel file dell'anno del servizio).
 * Con questo file non serve più ricaricare sul sito il proprio Excel dopo aver importato i PDF.
 */
import ExcelJS from "exceljs";
import { COLONNE_FATT_2026 } from "@/domain/fatture/righe";

export type RigaCompleta = {
  ds: string; data: Date; descrizione: string; quantita: number; prezzo: number; tasse: string; rateo: number; importoIva: number; totale: number; avere: number;
  microarea: string | null; macroarea: string | null; week: number; mese: number; anno: number; numero: string;
};
export type FatturaCompleta = { numero: string; ds: string; tipo: string; dataFattura: Date; fonte: string; sommaAvere: number };

const ordina = (r: RigaCompleta[]) => [...r].sort((a, b) => a.numero.localeCompare(b.numero) || a.data.getTime() - b.data.getTime() || a.descrizione.localeCompare(b.descrizione));

function foglioRighe(wb: ExcelJS.Workbook, nome: string, righe: RigaCompleta[]) {
  const ws = wb.addWorksheet(nome);
  const larghezze = [7, 12, 58, 10, 11, 8, 9, 14, 13, 13, 22, 26, 7, 7, 7, 22];
  const rows = ordina(righe).map((r) => [r.ds, r.data, r.descrizione, r.quantita, r.prezzo, r.tasse, r.rateo, r.importoIva, r.totale, r.avere, r.microarea, r.macroarea, r.week, r.mese, r.anno, r.numero]);
  ws.addTable({ name: nome, ref: "A1", headerRow: true, style: { theme: "TableStyleMedium2", showRowStripes: true }, columns: COLONNE_FATT_2026.map((c) => ({ name: c, filterButton: true })), rows: rows.length ? rows : [COLONNE_FATT_2026.map(() => null)] });
  const fmt: Record<number, string> = { 2: "dd/mm/yyyy", 5: "#,##0.00", 7: "0%", 8: "#,##0.00", 9: "#,##0.00", 10: "#,##0.00" };
  larghezze.forEach((w, i) => { const c = ws.getColumn(i + 1); c.width = w; if (fmt[i + 1]) c.numFmt = fmt[i + 1]; });
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export function excelCompleto(anno: number, righe: RigaCompleta[], fatture: FatturaCompleta[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FleetDSP";
  const delAnno = righe.filter((r) => r.anno === anno), altri = righe.filter((r) => r.anno !== anno);
  foglioRighe(wb, `fatt_${anno}`, delAnno);
  // elenco fatture: netto delle righe dell'anno e della fattura intera
  const perNum = new Map<string, { n: number; avere: number }>();
  for (const r of delAnno) { const x = perNum.get(r.numero) ?? { n: 0, avere: 0 }; x.n++; x.avere += r.avere; perNum.set(r.numero, x); }
  const ws = wb.addWorksheet("fatture");
  const intest = ["Numero", "DS", "Tipo", "Data fattura", `Righe ${anno}`, `Netto righe ${anno} €`, "Netto fattura intera €", "Origine", "Nota"];
  const rows = [...fatture].sort((a, b) => a.numero.localeCompare(b.numero)).map((f) => {
    const x = perNum.get(f.numero) ?? { n: 0, avere: 0 };
    const netto = Math.round(x.avere * 100) / 100;
    const nota = x.n === 0 ? `Solo righe di anni precedenti: vedi il foglio righe_altri_anni` : Math.abs(netto - f.sommaAvere) > 0.05 ? "Ha anche righe di un altro anno" : "";
    return [f.numero, f.ds, f.tipo, f.dataFattura, x.n, netto, f.sommaAvere, f.fonte === "PDF" ? "PDF" : "file storico", nota];
  });
  ws.addTable({ name: "fatture", ref: "A1", headerRow: true, style: { theme: "TableStyleLight9", showRowStripes: true }, columns: intest.map((c) => ({ name: c, filterButton: true })), rows: rows.length ? rows : [intest.map(() => null)] });
  [22, 7, 16, 13, 11, 18, 20, 13, 52].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.getColumn(4).numFmt = "dd/mm/yyyy"; ws.getColumn(6).numFmt = "#,##0.00"; ws.getColumn(7).numFmt = "#,##0.00";
  ws.views = [{ state: "frozen", ySplit: 1 }];
  foglioRighe(wb, "righe_altri_anni", altri);
  return wb;
}

export const nomeFileCompleto = (anno: number, d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `fatt_${anno}_completo_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.xlsx`;
};
