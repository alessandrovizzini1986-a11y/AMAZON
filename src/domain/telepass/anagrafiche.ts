/**
 * Anagrafiche del modulo: mappa Telepass (foglio "TELEPASS FINALE" di
 * TBusiness_carica_veicoli.xlsx) e censimento fuel card (foglio "Carte Q8 Flotte").
 * Colonne sempre per intestazione, mai per posizione.
 */
import { at, type Cell, type SheetGrid } from "@/domain/presenze/grid";
import { colonna, pyStr, rigaTesto } from "./comune";

export type Dispositivo = { codice: string; station: string; targa: string | null; progetto: string | null; check: string | null };

export type Carta = {
  pan: string;
  numeroCarta: string | null;
  identificativo: string | null;
  targa: string | null;
  bloccata: string | null;
  dataBlocco: string | null; // AAAA-MM-GG
  centroCosto: string | null;
  appalto: string | null;
  ds: string | null;
  ordine: number; // riga nel file: serve per l'abbinamento per Identificativo (vince la prima carta)
};

const vuoto = (s: string) => (s === "" ? null : s);

/** Codice dispositivo come lo script: str(v).strip().split(".")[0] */
export const codiceDispositivo = (v: Cell) => pyStr(v).split(".")[0];

export function isMappaTelepass(sheets: SheetGrid[]) {
  return sheets.some((s) => s.name.trim().toUpperCase() === "TELEPASS FINALE");
}

export function leggiMappaTelepass(sheets: SheetGrid[]): Dispositivo[] {
  const ws = sheets.find((s) => s.name.trim().toUpperCase() === "TELEPASS FINALE");
  if (!ws) throw new Error('foglio "TELEPASS FINALE" non trovato');
  const hdr = rigaTesto(ws, 0).map((h) => h.toUpperCase());
  const it = colonna(hdr, "TELEPASS"), ist = colonna(hdr, "STATION"), iac = colonna(hdr, "AREA C"), ipr = colonna(hdr, "PROGETTO"), ick = colonna(hdr, "CHECK");
  const mancanti = [["TELEPASS", it], ["STATION", ist], ["PROGETTO", ipr], ["CHECK", ick]].filter(([, i]) => i === -1).map(([n]) => n);
  if (mancanti.length) throw new Error(`in "TELEPASS FINALE" mancano le colonne ${mancanti.join(", ")}`);
  const per = new Map<string, Dispositivo>(); // a parità di codice vince l'ultima riga (come il dict dello script)
  for (let r = 1; r < ws.rows.length; r++) {
    const v = at(ws, r, it);
    if (v === null || v === "") continue;
    const codice = codiceDispositivo(v);
    if (!codice) continue;
    per.set(codice, {
      codice,
      station: pyStr(at(ws, r, ist)),
      targa: iac >= 0 ? vuoto(pyStr(at(ws, r, iac))) : null,
      progetto: vuoto(pyStr(at(ws, r, ipr))),
      check: vuoto(pyStr(at(ws, r, ick))),
    });
  }
  return [...per.values()];
}

function foglioCensimento(sheets: SheetGrid[]): SheetGrid | null {
  const byName = sheets.find((s) => s.name.trim().toLowerCase() === "carte q8 flotte");
  if (byName) return byName;
  return sheets.find((s) => { const h = rigaTesto(s, 0); return colonna(h, "PAN") >= 0 && colonna(h, "Nominativo driver") >= 0; }) ?? null;
}

export function isCensimento(sheets: SheetGrid[]) {
  const s = foglioCensimento(sheets);
  return !!s && colonna(rigaTesto(s, 0), "PAN") >= 0 && colonna(rigaTesto(s, 0), "DS") >= 0;
}

const isoData = (v: Cell): string | null => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(pyStr(v));
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
};

export function leggiCensimento(sheets: SheetGrid[]): Carta[] {
  const ws = foglioCensimento(sheets);
  if (!ws) throw new Error('foglio "Carte Q8 Flotte" (o intestazione con PAN e Nominativo driver) non trovato');
  const hdr = rigaTesto(ws, 0);
  const col = {
    pan: colonna(hdr, "PAN"), num: colonna(hdr, "N. Carta"), nom: colonna(hdr, "Nominativo driver"), targa: colonna(hdr, "Targa"),
    bl: colonna(hdr, "Bloccata"), dbl: colonna(hdr, "Data blocco"), cdc: colonna(hdr, "Centro di costo"), app: colonna(hdr, "AMZ/GLS"), ds: colonna(hdr, "DS"),
  };
  const mancanti = Object.entries({ PAN: col.pan, "Nominativo driver": col.nom, DS: col.ds, "AMZ/GLS": col.app, Bloccata: col.bl }).filter(([, i]) => i === -1).map(([n]) => n);
  if (mancanti.length) throw new Error(`nel censimento mancano le colonne ${mancanti.join(", ")}`);
  const get = (r: number, c: number) => (c >= 0 ? vuoto(pyStr(at(ws, r, c))) : null);
  const per = new Map<string, Carta>();
  for (let r = 1; r < ws.rows.length; r++) {
    const pan = pyStr(at(ws, r, col.pan));
    if (!pan) continue;
    per.set(pan, {
      pan, numeroCarta: get(r, col.num), identificativo: get(r, col.nom)?.toUpperCase() ?? null, targa: get(r, col.targa),
      bloccata: get(r, col.bl), dataBlocco: col.dbl >= 0 ? isoData(at(ws, r, col.dbl)) : null, centroCosto: get(r, col.cdc),
      appalto: get(r, col.app), ds: get(r, col.ds), ordine: r,
    });
  }
  return [...per.values()];
}

/** Carta senza DS utilizzabile (vuoto o "Da verificare"). */
export const cartaNonAttribuita = (ds: string | null | undefined) => !ds || ds.trim() === "" || ds.trim().toLowerCase() === "da verificare";

export type EsitoImport = { nuovi: number; aggiornati: number; invariati: number; spariti: number; ricomparsi: number };

/**
 * Confronto fra tabella attuale e file: chiave + campi del file. I record
 * presenti in tabella e assenti dal file sono "spariti" (non si cancellano).
 */
export function confrontaImport<T extends Record<string, unknown>>(
  attuali: (T & { nonPiuInFile?: boolean })[], nuovi: T[], chiave: keyof T, campi: (keyof T)[],
): EsitoImport & { dettaglio: { chiave: string; esito: "nuovo" | "aggiornato" | "invariato" | "sparito"; cambi: string[] }[] } {
  const att = new Map(attuali.map((a) => [String(a[chiave]), a]));
  const inFile = new Set(nuovi.map((n) => String(n[chiave])));
  const dettaglio: { chiave: string; esito: "nuovo" | "aggiornato" | "invariato" | "sparito"; cambi: string[] }[] = [];
  let ricomparsi = 0;
  for (const n of nuovi) {
    const k = String(n[chiave]);
    const a = att.get(k);
    if (!a) { dettaglio.push({ chiave: k, esito: "nuovo", cambi: [] }); continue; }
    const cambi = campi.filter((c) => (a[c] ?? null) !== (n[c] ?? null)).map((c) => `${String(c)}: ${a[c] ?? "—"} → ${n[c] ?? "—"}`);
    if (a.nonPiuInFile) { ricomparsi++; cambi.push("di nuovo nel file"); }
    dettaglio.push({ chiave: k, esito: cambi.length ? "aggiornato" : "invariato", cambi });
  }
  for (const a of attuali) if (!inFile.has(String(a[chiave])) && !a.nonPiuInFile) dettaglio.push({ chiave: String(a[chiave]), esito: "sparito", cambi: [] });
  const conta = (e: string) => dettaglio.filter((d) => d.esito === e).length;
  return { nuovi: conta("nuovo"), aggiornati: conta("aggiornato"), invariati: conta("invariato"), spariti: conta("sparito"), ricomparsi, dettaglio };
}
