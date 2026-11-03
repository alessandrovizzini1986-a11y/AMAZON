/**
 * Riconoscimento dei file del modulo Telepass e carburante, sempre dal
 * contenuto (mai dal nome). Tutto nel browser: il file non lascia il PC.
 */
import Papa from "papaparse";
import type { SheetGrid } from "@/domain/presenze/grid";
import { isCensimento, isMappaTelepass } from "@/domain/telepass/anagrafiche";
import { isTelepassCsv } from "@/domain/telepass/telepass";
import { isQ8 } from "@/domain/telepass/q8";
import { workbookToGrids } from "@/lib/presenze/excelGrid";
import { sha256 } from "@/lib/presenze/riconosci";

export type TipoFile = "TELEPASS" | "Q8" | "MAPPA" | "CENSIMENTO";

export type FileLetto =
  | { tipo: "TELEPASS"; nome: string; hash: string; tabella: string[][] }
  | { tipo: "Q8" | "MAPPA" | "CENSIMENTO"; nome: string; hash: string; sheets: SheetGrid[] };

export const PAGINA: Record<TipoFile, { href: string; nome: string; descr: string }> = {
  TELEPASS: { href: "/carburante-telepass/telepass", nome: "Telepass", descr: "export transazioni Telepass" },
  Q8: { href: "/carburante-telepass/q8", nome: "Q8", descr: "export transazioni Q8" },
  MAPPA: { href: "/carburante-telepass/anagrafiche", nome: "Anagrafiche", descr: "mappa Telepass (TBusiness_carica_veicoli)" },
  CENSIMENTO: { href: "/carburante-telepass/anagrafiche", nome: "Anagrafiche", descr: "censimento fuel card" },
};

export async function leggiFile(file: File): Promise<FileLetto> {
  const buf = await file.arrayBuffer();
  const hash = await sha256(buf);
  const head = new Uint8Array(buf.slice(0, 4));
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // xlsx/xlsm
  if (!isZip) {
    const testo = new TextDecoder("utf-8").decode(buf);
    if (!isTelepassCsv(testo)) throw new Error(`${file.name}: non è un export Telepass (la prima riga deve iniziare con "ID Transazione;ID Codificato;Movimento;") né un file Excel`);
    const p = Papa.parse<string[]>(testo.replace(/^﻿/, ""), { delimiter: ";", skipEmptyLines: false });
    return { tipo: "TELEPASS", nome: file.name, hash, tabella: p.data };
  }
  let sheets: SheetGrid[];
  try {
    sheets = await workbookToGrids(buf);
  } catch {
    throw new Error(`${file.name}: file Excel illeggibile`);
  }
  if (isMappaTelepass(sheets)) return { tipo: "MAPPA", nome: file.name, hash, sheets };
  if (isQ8(sheets)) return { tipo: "Q8", nome: file.name, hash, sheets };
  if (isCensimento(sheets)) return { tipo: "CENSIMENTO", nome: file.name, hash, sheets };
  throw new Error(`${file.name}: file non riconosciuto (né mappa Telepass con foglio "TELEPASS FINALE", né censimento fuel card, né export Q8 con "PAN Carta" e "N. ticket")`);
}

/** Messaggio per un file trascinato nella pagina sbagliata. */
export const paginaSbagliata = (f: FileLetto, attesi: TipoFile[]) =>
  attesi.includes(f.tipo) ? null : `${f.nome} è un ${PAGINA[f.tipo].descr}: va caricato nella pagina ${PAGINA[f.tipo].nome}.`;
