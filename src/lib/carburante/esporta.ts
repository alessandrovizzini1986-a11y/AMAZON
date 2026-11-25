/**
 * Colonne dell'export "Carburante: Q8 e telematica" (Excel e CSV). Puro: il file Excel lo scrive la route con exceljs.
 */
import { ETICHETTA_STATO, type EsitoLuogo } from "@/domain/carburante/riconciliazione";
import type { RigaPagina } from "./riconciliazione";

export type TipoColonna = "testo" | "data" | "litri" | "euro" | "km";
export type ColonnaExport = { nome: string; larghezza: number; tipo: TipoColonna; valore: (r: RigaPagina) => string | number | null };

export const ESITO_LUOGO: Record<EsitoLuogo, string> = {
  UGUALE: "Stesso posto",
  VICINO: "Stesso comune o stessa strada",
  DIVERSO: "Luogo diverso",
  IGNOTO: "Non confrontabile",
};

const dataIt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const carte = (r: RigaPagina) => [...new Set(r.q8.map((q) => q.identificativo).filter(Boolean))].join(", ");
const impianti = (r: RigaPagina) => [...new Set(r.q8.map((q) => q.impianto).filter(Boolean))].join(", ");

export const COLONNE_EXPORT: ColonnaExport[] = [
  { nome: "Giorno", larghezza: 11, tipo: "data", valore: (r) => r.giorno },
  { nome: "Ora Q8", larghezza: 8, tipo: "testo", valore: (r) => r.oraQ8 },
  { nome: "Ora Targa", larghezza: 9, tipo: "testo", valore: (r) => r.oraTarga },
  { nome: "Flotta", larghezza: 7, tipo: "testo", valore: (r) => r.flotta },
  { nome: "Targa", larghezza: 10, tipo: "testo", valore: (r) => r.targa },
  { nome: "Tipo", larghezza: 28, tipo: "testo", valore: (r) => ETICHETTA_STATO[r.stato] },
  { nome: "Litri Q8", larghezza: 9, tipo: "litri", valore: (r) => r.litriQ8 },
  { nome: "Litri Targa", larghezza: 10, tipo: "litri", valore: (r) => r.litriTarga },
  { nome: "Delta litri (Targa − Q8)", larghezza: 12, tipo: "litri", valore: (r) => r.deltaLitri },
  { nome: "Valore stimato € (IVA esclusa)", larghezza: 14, tipo: "euro", valore: (r) => r.euro },
  { nome: "Luogo Q8", larghezza: 34, tipo: "testo", valore: (r) => r.luogoQ8 },
  { nome: "Posizione Targa", larghezza: 40, tipo: "testo", valore: (r) => r.luogoTarga },
  { nome: "Confronto luogo", larghezza: 18, tipo: "testo", valore: (r) => ESITO_LUOGO[r.luogo] },
  { nome: "Distanza km", larghezza: 9, tipo: "km", valore: (r) => r.distanzaKm },
  { nome: "Motivo", larghezza: 70, tipo: "testo", valore: (r) => r.motivo },
  { nome: "Carta", larghezza: 12, tipo: "testo", valore: (r) => carte(r) || null },
  { nome: "Distributore Q8", larghezza: 12, tipo: "testo", valore: (r) => impianti(r) || null },
  { nome: "Furgone abituale della carta", larghezza: 16, tipo: "testo", valore: (r) => (r.abituale ? `${r.abituale.targa} (${r.abituale.volte} su ${r.abituale.su})` : null) },
  {
    nome: "Archiviata", larghezza: 40, tipo: "testo",
    valore: (r) => (r.archiviata ? [r.archiviata.motivo, r.archiviata.nota, `da ${r.archiviata.da}`, dataIt(r.archiviata.il)].filter(Boolean).join(" · ")
      : r.statoCambiato ? `Stato cambiato dopo l'archiviazione: era «${ETICHETTA_STATO[r.statoCambiato.prima]}»` : null),
  },
];

/**
 * Un testo che Excel (o LibreOffice) leggerebbe come formula: comincia, anche dopo spazi o tabulazioni, con = + - @.
 * Indirizzi, motivi e note arrivano da file e portali esterni: non devono poter diventare formule.
 */
export const sembraFormula = (s: string) => /^[ \t\r\n]*[=+\-@]/.test(s);
/** Testo per il CSV: davanti a una possibile formula va un apostrofo, così Excel la mostra come testo. */
export const testoSicuro = (s: string) => (sembraFormula(s) ? `'${s}` : s);

/** Valore per il CSV: numeri con la virgola (Excel italiano), date gg/mm/aaaa, testi senza formule. */
function cellaCsv(c: ColonnaExport, r: RigaPagina): string {
  const v = c.valore(r);
  if (v === null || v === undefined || v === "") return "";
  // i numeri (anche negativi, come il delta) restano numeri: la protezione vale solo per i testi
  if (typeof v === "number") return String(c.tipo === "euro" ? v.toFixed(2) : Math.round(v * 10) / 10).replace(".", ",");
  if (c.tipo === "data" && /^\d{4}-\d\d-\d\d$/.test(v)) return `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`;
  return testoSicuro(v);
}
const quota = (s: string) => (/[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** CSV separato da ";" con BOM UTF-8 (si apre bene in Excel italiano). */
export function csvRighe(righe: RigaPagina[]): string {
  const linee = [COLONNE_EXPORT.map((c) => quota(testoSicuro(c.nome))).join(";"), ...righe.map((r) => COLONNE_EXPORT.map((c) => quota(cellaCsv(c, r))).join(";"))];
  return `﻿${linee.join("\r\n")}\r\n`;
}

export const nomeFileExport = (mese: string, formato: "xlsx" | "csv") => `Carburante_Q8_Targa_${mese}.${formato}`;
