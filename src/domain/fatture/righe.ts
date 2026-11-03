/**
 * Righe nel formato del foglio fatt_2026 (16 colonne, SPEC §4.1) e testo TSV
 * da incollare in Excel italiano (§4.3).
 */
import type { RigaFattura } from "./parser";

export const COLONNE_FATT_2026 = ["DS", "Data", "Descrizione", "Quantità", "Prezzo (€)", "Tasse", "Rateo IVA", "Importo IVA (€)", "Totale (€)", "AVERE", "MICROAREA", "MACROAREA", "WEEK", "MESE", "ANNO", "Numero"] as const;

export type RigaFatt = {
  ds: string; data: string; descrizione: string; quantita: number; prezzo: number; tasse: string; rateo: number;
  importoIva: number; totale: number; avere: number; microarea: string | null; macroarea: string | null;
  week: number; mese: number; anno: number; numero: string;
};

export const daRigaPdf = (r: RigaFattura, numero: string, ds: string): RigaFatt => ({
  ds, data: r.Data.toISOString().slice(0, 10), descrizione: r.Descrizione, quantita: r.Quantita, prezzo: r.Prezzo, tasse: r.Tasse,
  rateo: r.Rateo, importoIva: r.ImportoIVA, totale: r.Totale, avere: r.AVERE, microarea: null, macroarea: null,
  week: r.WEEK, mese: r.MESE, anno: r.ANNO, numero,
});

const ggmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const virgola = (x: number) => String(x).replace(".", ",");
const dec2 = (x: number) => x.toFixed(2).replace(".", ",");

/** Una riga TSV: TAB, date gg/mm/aaaa, decimali con virgola, niente migliaia, rateo "22%". */
export function rigaTsv(r: RigaFatt): string {
  return [
    r.ds, ggmmaaaa(r.data), r.descrizione, String(r.quantita), virgola(r.prezzo), r.tasse, `${Math.round(r.rateo * 100)}%`,
    dec2(r.importoIva), dec2(r.totale), dec2(r.avere), r.microarea ?? "", r.macroarea ?? "", String(r.week), String(r.mese), String(r.anno), r.numero,
  ].join("\t");
}

export const tsv = (righe: RigaFatt[]) => righe.map(rigaTsv).join("\n");

/** Ordine: numero fattura crescente, poi ordine del PDF (stabile). */
export const ordinaRighe = (righe: RigaFatt[]) => [...righe].sort((a, b) => (a.numero < b.numero ? -1 : a.numero > b.numero ? 1 : 0));
