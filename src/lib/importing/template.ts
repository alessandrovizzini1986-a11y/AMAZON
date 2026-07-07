import "server-only";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { IMPORT_SPECS } from "@/domain/importing";

/**
 * Genera i template scaricabili (.xlsx con foglio Istruzioni, oppure .csv)
 * con le colonne nominate esattamente come si aspetta l'auto-mapping.
 */
export async function buildXlsxTemplate(entity: string): Promise<Buffer> {
  const spec = IMPORT_SPECS[entity];
  if (!spec) throw new Error(`Entità sconosciuta: ${entity}`);

  const wb = new ExcelJS.Workbook();

  const data = wb.addWorksheet(spec.label);
  data.addRow(spec.fields.map((f) => f.label));
  data.getRow(1).font = { bold: true };
  data.columns.forEach((col, i) => {
    col.width = Math.max(18, spec.fields[i].label.length + 4);
    // colonne data formattate come data reale, non testo
    const f = spec.fields[i];
    if (f.type === "date") col.numFmt = "dd/mm/yyyy";
    if (f.type === "datetime") col.numFmt = "dd/mm/yyyy hh:mm";
  });

  const instr = wb.addWorksheet("Istruzioni");
  instr.columns = [{ width: 28 }, { width: 14 }, { width: 90 }];
  instr.addRow([`Template: ${spec.label}`]);
  instr.getRow(1).font = { bold: true, size: 14 };
  instr.addRow([spec.description]);
  instr.addRow([]);
  instr.addRow(["Colonna", "Obbligatoria", "Formato e note"]);
  instr.getRow(4).font = { bold: true };
  for (const f of spec.fields) {
    const fmt: Record<string, string> = {
      string: "testo",
      int: "numero intero",
      decimal: "importo (usare la cella numerica, es. 38,50)",
      date: "DATA reale (cella formattata data, non testo) — gg/mm/aaaa",
      datetime: "DATA E ORA reale — gg/mm/aaaa hh:mm",
      enum: `uno tra: ${f.enumValues?.join(", ")}`,
      boolean: "SI / NO",
    };
    instr.addRow([f.label, f.required ? "SÌ" : "no", [fmt[f.type], f.note].filter(Boolean).join(" — ")]);
  }
  instr.addRow([]);
  instr.addRow(["Non rinominare le colonne se possibile: intestazioni diverse potranno comunque essere rimappate in fase di import."]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function buildCsvTemplate(entity: string): string {
  const spec = IMPORT_SPECS[entity];
  if (!spec) throw new Error(`Entità sconosciuta: ${entity}`);
  return Papa.unparse([spec.fields.map((f) => f.label)]);
}
