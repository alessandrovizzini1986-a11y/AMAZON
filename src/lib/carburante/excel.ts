/**
 * File Excel dell'incrocio Q8 / telematica: foglio delle righe (stesse colonne del CSV) e foglio di riepilogo.
 * Solo server (exceljs è pesante: il browser importa esporta.ts, non questo file).
 */
import ExcelJS from "exceljs";
import { ELENCO_FLOTTE, ETICHETTA_STATO, ORDINE_STATI, type Riepilogo } from "@/domain/carburante/riconciliazione";
import { etichettaMese } from "@/lib/mesi";
import { COLONNE_EXPORT, sembraFormula } from "./esporta";
import { riepilogoScope, type FiltroCarburante, type FlottaFiltro } from "./filtro";
import type { RigaPagina } from "./riconciliazione";

const FORMATO_NUM = { litri: "0.0", euro: "#,##0.00", km: "0.0", data: "dd/mm/yyyy" } as const;
/** formato "Testo" di Excel: la cella resta testo anche se qualcuno la modifica */
const TESTO = "@";

const nomeFlotta = (f: FlottaFiltro) => (f === "TUTTE" ? "Tutte le flotte" : f);

/**
 * @param righe le righe esportate (quelle che si vedono con i filtri)
 * @param tutte tutte le righe del mese: il riepilogo usa flotta e targa scelte come le schede della pagina
 */
export async function excelRiconciliazione(righe: RigaPagina[], tutte: RigaPagina[], f: FiltroCarburante): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FleetDSP";
  const ws = wb.addWorksheet("Incrocio Q8 Targa");
  ws.columns = COLONNE_EXPORT.map((c) => ({ header: c.nome, width: c.larghezza, style: c.tipo === "testo" ? {} : { numFmt: FORMATO_NUM[c.tipo] } }));
  for (const r of righe) {
    const riga = ws.addRow(COLONNE_EXPORT.map((c) => {
      const v = c.valore(r);
      if (v === null || v === undefined) return null;
      // il giorno come data vera (filtri e ordinamenti di Excel), a mezzanotte UTC così non scivola di un giorno
      if (c.tipo === "data" && typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v)) return new Date(`${v}T00:00:00Z`);
      return v;
    }));
    // un testo che sembra una formula (= + - @ in testa) resta testo: valore stringa e formato Testo
    riga.eachCell((cella) => { if (typeof cella.value === "string" && sembraFormula(cella.value)) cella.numFmt = TESTO; });
  }
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle", wrapText: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLONNE_EXPORT.length } };

  // secondo foglio: gli stessi numeri delle schede in cima alla pagina, per flotta e targa scelte
  const rie = wb.addWorksheet("Riepilogo");
  const colonne: { nome: string; r: Riepilogo }[] = f.targa
    ? [{ nome: `${nomeFlotta(f.flotta)} · ${f.targa}`, r: riepilogoScope(tutte, f) }]
    : (["TUTTE", ...ELENCO_FLOTTE] as FlottaFiltro[]).map((x) => ({ nome: nomeFlotta(x), r: riepilogoScope(tutte, { flotta: x, targa: null }) }));
  rie.columns = [{ header: "Voce", width: 46 }, ...colonne.map((c) => ({ header: c.nome, width: f.targa ? 24 : 16 }))];
  rie.addRow(["Transazioni Q8 analizzate", ...colonne.map((c) => c.r.pagamentiQ8)]);
  rie.addRow(["Anomalie", ...colonne.map((c) => c.r.anomalie)]);
  for (const s of ORDINE_STATI) rie.addRow([`  ${ETICHETTA_STATO[s]}`, ...colonne.map((c) => c.r.perStato[s])]);
  const litri = rie.addRow(["Litri non giustificati", ...colonne.map((c) => c.r.litriMancanti)]);
  const euro = rie.addRow(["Valore stimato dell'ammanco € (IVA esclusa)", ...colonne.map((c) => c.r.euroMancanti)]);
  litri.eachCell((c, col) => { if (col > 1) c.numFmt = "0.0"; });
  euro.eachCell((c, col) => { if (col > 1) c.numFmt = "#,##0.00"; });
  rie.addRow([]);
  const perimetro = f.targa
    ? `solo le righe del furgone ${f.targa}${f.flotta === "TUTTE" ? "" : ` (flotta ${f.flotta})`}; per i pagamenti senza furgone vale il furgone abituale della carta`
    : "tutte le righe del mese, di DER2 e GLS insieme e di ogni flotta";
  const schede = f.targa ? "Sono gli stessi numeri delle schede in cima alla pagina" : `La colonna «${nomeFlotta(f.flotta)}» ha gli stessi numeri delle schede in cima alla pagina`;
  rie.addRow(["Di cosa sono i totali", `${etichettaMese(f.mese)}: ${perimetro}. ${schede}: contano anche le righe che i filtri «regolari», «non verificabili» e «archiviate» tolgono dal primo foglio. Le righe archiviate contano solo tra le transazioni analizzate, non tra anomalie, litri e valore.`]);
  rie.addRow(["Mese", etichettaMese(f.mese)]);
  rie.addRow(["Flotta", nomeFlotta(f.flotta)]);
  rie.addRow(["Targa", f.targa ?? "Tutte"]);
  rie.addRow(["Regolari inclusi nel primo foglio", f.regolari ? "Sì" : "No"]);
  rie.addRow(["Non verificabili inclusi nel primo foglio", f.nonVerificabili ? "Sì" : "No"]);
  rie.addRow(["Archiviate incluse nel primo foglio", f.archiviate ? "Sì" : "No"]);
  rie.addRow(["Righe nel primo foglio", righe.length]);
  rie.getRow(1).font = { bold: true };
  rie.views = [{ state: "frozen", ySplit: 1 }];

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
