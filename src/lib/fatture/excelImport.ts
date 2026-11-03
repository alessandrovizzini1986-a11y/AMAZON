import ExcelJS from "exceljs";
import { COLONNE_FATT_2026, type RigaFatt } from "@/domain/fatture/righe";

type Tab = { name: string; cols: { name: string; numFmt?: string; width?: number }[]; rows: (string | number | Date | null)[][] };

function tabella(wb: ExcelJS.Workbook, foglio: string, t: Tab) {
  const ws = wb.addWorksheet(foglio);
  const rows = t.rows.length ? t.rows : [t.cols.map(() => null)];
  ws.addTable({ name: t.name, ref: "A1", headerRow: true, style: { theme: "TableStyleMedium2", showRowStripes: true }, columns: t.cols.map((c) => ({ name: c.name, filterButton: true })), rows });
  t.cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.numFmt) col.numFmt = c.numFmt;
    col.width = c.width ?? Math.max(10, c.name.length + 2);
  });
  return ws;
}

const d = (iso: string | null) => (iso ? new Date(iso + "T00:00:00Z") : null);

export type FatturaExcel = { numero: string; ds: string; tipo: string; dataFattura: string | null; periodoDa: string | null; periodoA: string | null; importoDovuto: number | null; sommaTotale: number; sommaAvere: number; delta: number | null; nRighe: number; stato: string; file: string };
export type ScartataExcel = { file: string; stato: string; motivo: string };
export type DescrizioneExcel = { descrizione: string; classe: string; nRighe: number; avere: number; nuova: boolean };

/** import_AAAA-MM-GG_HHMM.xlsx: fogli righe (16 colonne di fatt_2026), fatture, scartate, descrizioni. */
export function excelImport(righe: RigaFatt[], fatture: FatturaExcel[], scartate: ScartataExcel[], descrizioni: DescrizioneExcel[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FleetDSP";
  const fmt: Record<string, string> = { Data: "dd/mm/yyyy", "Rateo IVA": "0%", "Importo IVA (€)": "0.00", "Totale (€)": "0.00", AVERE: "0.00" };
  tabella(wb, "righe", {
    name: "righe",
    cols: COLONNE_FATT_2026.map((c) => ({ name: c, numFmt: fmt[c], width: c === "Descrizione" ? 60 : c === "Numero" ? 22 : undefined })),
    rows: righe.map((r) => [r.ds, d(r.data), r.descrizione, r.quantita, r.prezzo, r.tasse, r.rateo, r.importoIva, r.totale, r.avere, r.microarea, r.macroarea, r.week, r.mese, r.anno, r.numero]),
  });
  tabella(wb, "fatture", {
    name: "fatture",
    cols: [{ name: "Numero", width: 22 }, { name: "DS" }, { name: "Tipo", width: 16 }, { name: "Data fattura", numFmt: "dd/mm/yyyy" }, { name: "Periodo da", numFmt: "dd/mm/yyyy" }, { name: "Periodo a", numFmt: "dd/mm/yyyy" },
      { name: "Importo PDF", numFmt: "0.00" }, { name: "Somma righe", numFmt: "0.00" }, { name: "Delta", numFmt: "0.00" }, { name: "Somma AVERE", numFmt: "0.00" }, { name: "N righe" }, { name: "Stato", width: 30 }, { name: "File", width: 34 }],
    rows: fatture.map((f) => [f.numero, f.ds, f.tipo, d(f.dataFattura), d(f.periodoDa), d(f.periodoA), f.importoDovuto, f.sommaTotale, f.delta, f.sommaAvere, f.nRighe, f.stato, f.file]),
  });
  tabella(wb, "scartate", { name: "scartate", cols: [{ name: "File", width: 34 }, { name: "Stato", width: 24 }, { name: "Motivo", width: 60 }], rows: scartate.map((s) => [s.file, s.stato, s.motivo]) });
  tabella(wb, "descrizioni", {
    name: "descrizioni",
    cols: [{ name: "Descrizione", width: 60 }, { name: "Classe", width: 18 }, { name: "N righe" }, { name: "Somma AVERE", numFmt: "0.00" }, { name: "Nuova" }],
    rows: descrizioni.map((x) => [x.descrizione, x.classe, x.nRighe, x.avere, x.nuova ? "nuova" : ""]),
  });
  return wb;
}

export const nomeFileImport = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `import_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.xlsx`;
};
