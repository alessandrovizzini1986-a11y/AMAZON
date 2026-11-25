/**
 * File Excel dell'incrocio Q8 / telematica: foglio delle righe (stesse colonne del CSV) e foglio di riepilogo.
 * Solo server (exceljs è pesante: il browser importa esporta.ts, non questo file).
 */
import ExcelJS from "exceljs";
import { ETICHETTA_STATO, ORDINE_STATI } from "@/domain/carburante/riconciliazione";
import { etichettaMese } from "@/lib/mesi";
import { COLONNE_EXPORT } from "./esporta";
import type { FiltroCarburante } from "./filtro";
import type { DatiRiconciliazione, RigaPagina } from "./riconciliazione";

const FORMATO_NUM = { litri: "0.0", euro: "#,##0.00", km: "0.0", data: "dd/mm/yyyy" } as const;

export async function excelRiconciliazione(righe: RigaPagina[], dati: Pick<DatiRiconciliazione, "riepilogo">, f: FiltroCarburante): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FleetDSP";
  const ws = wb.addWorksheet("Incrocio Q8 Targa");
  ws.columns = COLONNE_EXPORT.map((c) => ({ header: c.nome, width: c.larghezza, style: c.tipo === "testo" ? {} : { numFmt: FORMATO_NUM[c.tipo] } }));
  for (const r of righe) {
    ws.addRow(COLONNE_EXPORT.map((c) => {
      const v = c.valore(r);
      if (v === null || v === undefined) return null;
      // il giorno come data vera (filtri e ordinamenti di Excel), a mezzanotte UTC così non scivola di un giorno
      if (c.tipo === "data" && typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v)) return new Date(`${v}T00:00:00Z`);
      return v;
    }));
  }
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle", wrapText: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLONNE_EXPORT.length } };

  // secondo foglio: i numeri delle schede e i filtri usati
  const rie = wb.addWorksheet("Riepilogo");
  rie.columns = [{ header: "Voce", width: 44 }, { header: "Tutte", width: 12 }, { header: "DER2", width: 12 }, { header: "GLS", width: 12 }];
  const k = ["TUTTE", "DER2", "GLS"] as const;
  rie.addRow(["Transazioni Q8 analizzate", ...k.map((x) => dati.riepilogo[x].pagamentiQ8)]);
  rie.addRow(["Anomalie", ...k.map((x) => dati.riepilogo[x].anomalie)]);
  for (const s of ORDINE_STATI) rie.addRow([`  ${ETICHETTA_STATO[s]}`, ...k.map((x) => dati.riepilogo[x].perStato[s])]);
  const litri = rie.addRow(["Litri non giustificati", ...k.map((x) => dati.riepilogo[x].litriMancanti)]);
  const euro = rie.addRow(["Valore stimato dell'ammanco € (IVA esclusa)", ...k.map((x) => dati.riepilogo[x].euroMancanti)]);
  litri.eachCell((c, col) => { if (col > 1) c.numFmt = "0.0"; });
  euro.eachCell((c, col) => { if (col > 1) c.numFmt = "#,##0.00"; });
  rie.addRow([]);
  rie.addRow(["Mese", etichettaMese(f.mese)]);
  rie.addRow(["Flotta", f.flotta === "TUTTE" ? "Tutte" : f.flotta]);
  rie.addRow(["Targa", f.targa ?? "Tutte"]);
  rie.addRow(["Regolari inclusi", f.regolari ? "Sì" : "No"]);
  rie.addRow(["Non verificabili inclusi", f.nonVerificabili ? "Sì" : "No"]);
  rie.addRow(["Archiviate incluse", f.archiviate ? "Sì" : "No"]);
  rie.addRow(["Righe esportate", righe.length]);
  rie.addRow(["Nota", "Le righe archiviate non contano tra anomalie, litri e valore."]);
  rie.getRow(1).font = { bold: true };
  rie.views = [{ state: "frozen", ySplit: 1 }];

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
