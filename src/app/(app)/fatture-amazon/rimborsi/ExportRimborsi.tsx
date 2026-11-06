"use client";

import ExcelJS from "exceljs";
import { scarica } from "@/lib/presenze/excelUtil";
import { ETICHETTA_VOCE, type RecapVoce, type RigaClassificata } from "@/domain/fatture/rimborsi";

/** Excel per le contestazioni: recap mese × voce × DS e tutte le righe di fattura usate. */
export function ExportRimborsi({ anno, righe, recap }: { anno: number; righe: RigaClassificata[]; recap: { mese: string; recap: RecapVoce[] }[] }) {
  const vai = async () => {
    const wb = new ExcelJS.Workbook();
    const eur = "#,##0.00";
    const r = wb.addWorksheet("Recap");
    r.addRow(["Mese", "Voce", "DS", "Nostro costo / atteso", "Rimborsato", "Differenza", "Fatture", "Fonte del costo"]).font = { bold: true };
    for (const m of recap) for (const v of m.recap) for (const [ds, c] of Object.entries(v.perDs)) r.addRow([m.mese, ETICHETTA_VOCE[v.voce], ds, c.costo, c.rimborsato, c.differenza, c.fatture.join(", "), v.notaCosto]);
    [4, 5, 6].forEach((i) => (r.getColumn(i).numFmt = eur));
    r.columns.forEach((c, i) => (c.width = [9, 16, 7, 18, 14, 14, 40, 60][i]));
    const d = wb.addWorksheet("Righe fattura");
    d.addRow(["Voce", "DS", "Data", "Fattura", "Descrizione", "Quantità", "Importo (IVA escl.)", "Storno"]).font = { bold: true };
    for (const x of [...righe].sort((a, b) => a.voce.localeCompare(b.voce) || a.ds.localeCompare(b.ds) || a.data.localeCompare(b.data))) d.addRow([ETICHETTA_VOCE[x.voce], x.ds, x.data, x.numero, x.descrizione, x.quantita, x.avere, x.storno ? "sì" : ""]);
    d.getColumn(7).numFmt = eur;
    d.columns.forEach((c, i) => (c.width = [16, 7, 11, 22, 50, 10, 16, 8][i]));
    for (const w of [r, d]) w.views = [{ state: "frozen", ySplit: 1 }];
    await scarica(wb, `Rimborsi_Amazon_${anno}.xlsx`);
  };
  return <button type="button" className="btn-secondary" onClick={vai}>Scarica Excel {anno}</button>;
}
