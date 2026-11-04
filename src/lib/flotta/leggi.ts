/**
 * Lettura dei file flotta (Lista Targhe, fatture ALD / Arval / Avis / Europcar) da matrici di celle
 * (righe × colonne, come le dà ExcelJS o il lettore xlsx del sito) in righe pulite per
 * `src/domain/flotta/riconcilia.ts`. Nessun accesso a file o DB qui.
 */
import type { FatturaRiga, ListaRiga, CessatoRiga } from "@/domain/flotta/riconcilia";
import { normTarga } from "@/domain/flotta/riconcilia";

export type Cella = unknown;
export type Matrice = Cella[][];

/** Valore semplice di una cella ExcelJS (formula → risultato, rich text → testo, hyperlink → testo). */
export function valore(c: Cella): string | number | Date | null {
  if (c === null || c === undefined) return null;
  if (c instanceof Date || typeof c === "number" || typeof c === "string") return c;
  if (typeof c === "boolean") return c ? "SI" : "NO";
  if (typeof c === "object") {
    const o = c as { result?: unknown; richText?: { text: string }[]; text?: string; error?: string };
    if ("result" in o) return o.result === undefined ? null : valore(o.result);
    if (o.richText) return o.richText.map((x) => x.text).join("");
    if (typeof o.text === "string") return o.text;
    if (o.error) return null;
  }
  return null;
}

const testo = (c: Cella) => { const v = valore(c); return v === null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim(); };
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase();

/** ISO AAAA-MM-GG da Date, seriale Excel, "gg/mm/aaaa" o "aaaa-mm-gg". */
export function dataIso(c: Cella): string | null {
  const v = valore(c);
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number") return v > 20000 && v < 80000 ? new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10) : null;
  const s = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

/** Numero da cella: 1234.5, "1.234,50", "€ 900", "#ERROR!" → null. */
export function numero(c: Cella): number | null {
  const v = valore(c);
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").replace(/[€\s ]/g, "").replace(/^'|'$/g, "");
  if (!s || s === "-") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Riga di intestazione: la prima che contiene tutte le etichette (prefisso, maiuscole indifferenti). */
function intestazione(m: Matrice, etichette: string[], max = 15) {
  for (let i = 0; i < Math.min(m.length, max); i++) {
    const h = (m[i] ?? []).map((c) => norm(testo(c)));
    if (etichette.every((e) => h.some((x) => x.startsWith(norm(e))))) {
      const col = (e: string) => h.findIndex((x) => x.startsWith(norm(e)));
      return { riga: i, col };
    }
  }
  return null;
}

/** Codice station prima del trattino ("DLO2 - ORIGGIO" → "DLO2"). */
export const stationDa = (s: string) => { const c = s.split(/\s*-\s*/)[0].trim().toUpperCase(); return /^[A-Z]{2,4}\d?$/.test(c) ? c : null; };

/** Foglio `Attivi` della Lista Targhe. Righe senza station (solo targa) scartate. */
export function leggiListaAttivi(m: Matrice): ListaRiga[] {
  const h = intestazione(m, ["Targa", "Nuova DS", "Stato", "Società noleggio"]);
  if (!h) throw new Error("Foglio Attivi: intestazione non trovata (Targa, Nuova DS, Stato, Società noleggio)");
  const c = { targa: h.col("Targa"), ds: h.col("Nuova DS"), marca: h.col("Marca"), modello: h.col("Modello"), stato: h.col("Stato"), soc: h.col("Società noleggio"), tipo: h.col("Tipo"), ra: h.col("N° RA"), inizio: h.col("Data inizio"), fine: h.col("Data Fine"), note: h.col("Note"), tariffa: h.col("Tariffa"), frDanni: h.col("FR.DANNI") };
  const out: ListaRiga[] = [];
  for (const r of m.slice(h.riga + 1)) {
    const targa = normTarga(testo(r[c.targa]));
    const station = stationDa(testo(r[c.ds]));
    if (!targa || !station) continue;
    out.push({
      targa, station, marca: testo(r[c.marca]), modello: testo(r[c.modello]), stato: testo(r[c.stato]), societa: testo(r[c.soc]), tipo: testo(r[c.tipo]),
      ra: c.ra >= 0 ? testo(r[c.ra]).replace(/\.0$/, "") || null : null, inizio: dataIso(r[c.inizio]), fine: dataIso(r[c.fine]),
      // note: solo testo vero (non formule residue né date rovinate tipo "10/31/1898")
      note: c.note >= 0 && typeof valore(r[c.note]) === "string" && !/^\d{1,2}\/\d{1,2}\/1[89]\d\d$/.test(testo(r[c.note])) ? testo(r[c.note]) || null : null,
      tariffa: c.tariffa >= 0 ? numero(r[c.tariffa]) : null, franchigiaDanni: c.frDanni >= 0 ? numero(r[c.frDanni]) : null,
    });
  }
  return out;
}

/** Foglio `Cessati`: una riga per periodo concluso. */
export function leggiListaCessati(m: Matrice): CessatoRiga[] {
  const h = intestazione(m, ["Targa", "Nuova DS", "Data inizio"]);
  if (!h) throw new Error("Foglio Cessati: intestazione non trovata");
  const c = { targa: h.col("Targa"), ds: h.col("Nuova DS"), inizio: h.col("Data inizio"), fine: h.col("Data Fine"), soc: h.col("Società noleggio") };
  const out: CessatoRiga[] = [];
  for (const r of m.slice(h.riga + 1)) {
    const targa = normTarga(testo(r[c.targa]));
    if (!targa) continue;
    out.push({ targa, station: stationDa(testo(r[c.ds])), inizio: dataIso(r[c.inizio]), fine: dataIso(r[c.fine]), societa: testo(r[c.soc]) });
  }
  return out;
}

const ultimoGiorno = (iso: string) => { const [a, mm] = iso.split("-").map(Number); return new Date(Date.UTC(a, mm, 0)).toISOString().slice(0, 10); };
const mesePieno = (dal: string | null, al: string | null) => !!dal && !!al && dal.endsWith("-01") && al === ultimoGiorno(dal);

/** Fatture ALD / Ayvens (YTD): TARGA, DAL, AL, CANONE (imponibile), TIPOLOGIA DI COSTO, CDC. */
export function leggiFattureAld(m: Matrice): FatturaRiga[] {
  const h = intestazione(m, ["Numero fattura", "TARGA", "DAL", "CANONE", "TIPOLOGIA DI COSTO"]);
  if (!h) throw new Error("ALD: intestazione non trovata");
  const c = { nf: h.col("Numero fattura"), targa: h.col("TARGA"), dal: h.col("DAL"), al: h.col("AL"), imp: h.col("CANONE"), tip: h.col("TIPOLOGIA DI COSTO"), cdc: h.col("CDC") };
  return m.slice(h.riga + 1).flatMap((r): FatturaRiga[] => {
    const targa = normTarga(testo(r[c.targa]));
    const importo = numero(r[c.imp]);
    if (!targa || importo === null) return [];
    const dal = dataIso(r[c.dal]), al = dataIso(r[c.al]);
    return [{ fornitore: "ALD", fattura: testo(r[c.nf]), targa, voce: norm(testo(r[c.tip])), dal, al, mese: dal?.slice(0, 7) ?? null, importo, mesePieno: mesePieno(dal, al), cdc: testo(r[c.cdc]).replace(/\.0$/, "") || null }];
  });
}

/** Fatture Arval (mese): Targa, DAL, AL, Imponibile, TIPOLOGIA COSTO, CDC (spesso #ERROR!: si filtra per targa). */
export function leggiFattureArval(m: Matrice): FatturaRiga[] {
  const h = intestazione(m, ["N.Fattura", "Imponibile", "Targa", "TIPOLOGIA COSTO"]);
  if (!h) throw new Error("Arval: intestazione non trovata");
  const c = { nf: h.col("N.Fattura"), targa: h.col("Targa"), dal: h.col("DAL"), al: h.col("AL"), imp: h.col("Imponibile"), tip: h.col("TIPOLOGIA COSTO"), cdc: h.col("CDC") };
  return m.slice(h.riga + 1).flatMap((r): FatturaRiga[] => {
    const targa = normTarga(testo(r[c.targa]));
    const importo = numero(r[c.imp]);
    if (!targa || importo === null) return [];
    const dal = dataIso(r[c.dal]), al = dataIso(r[c.al]);
    const cdc = testo(r[c.cdc]).replace(/\.0$/, "");
    return [{ fornitore: "ARVAL", fattura: testo(r[c.nf]), targa, voce: norm(testo(r[c.tip])), dal, al, mese: dal?.slice(0, 7) ?? null, importo, mesePieno: mesePieno(dal, al), cdc: /^\d+$/.test(cdc) ? cdc : null }];
  });
}

/** Fatture Avis / Amicoblu (YTD): targa in ANNOTAZIONI, IMPONIBILE, DATA EMISSIONE, TIPOLOGIA COSTO, CDC. */
export function leggiFattureAvis(m: Matrice): FatturaRiga[] {
  const h = intestazione(m, ["TIPO DOC", "NUMERO FATT", "IMPONIBILE", "TIPOLOGIA COSTO"]);
  if (!h) throw new Error("Avis: intestazione non trovata");
  const c = { nf: h.col("NUMERO FATT"), data: h.col("DATA EMISSIONE"), imp: h.col("IMPONIBILE"), tip: h.col("TIPOLOGIA COSTO"), cdc: h.col("CDC"), ann: h.col("ANNOTAZIONI") };
  return m.slice(h.riga + 1).flatMap((r): FatturaRiga[] => {
    const targa = normTarga(testo(r[c.ann]));
    const importo = numero(r[c.imp]);
    if (!/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(targa) || importo === null) return [];
    const data = dataIso(r[c.data]);
    const voce = norm(testo(r[c.tip]));
    // canone mensile Avis: fattura a inizio periodo, una per targa e mese
    return [{ fornitore: "AVIS", fattura: testo(r[c.nf]).replace(/'/g, ""), targa, voce, dal: data, al: data, mese: data?.slice(0, 7) ?? null, importo, mesePieno: voce === "CANONE", cdc: testo(r[c.cdc]).replace(/\.0$/, "") || null }];
  });
}

/** Fatture Europcar (mese): TARGA, GG FT, noleggio base, DAL, AL, gruppo auto fatturato. */
export function leggiFattureEuropcar(m: Matrice): FatturaRiga[] {
  const h = intestazione(m, ["Fattura", "TARGA", "GG FT", "noleggio base"]);
  if (!h) throw new Error("Europcar: intestazione non trovata");
  const c = { nf: h.col("Fattura"), targa: h.col("TARGA"), gg: h.col("GG FT"), base: h.col("noleggio base"), dal: h.col("DAL"), al: h.col("AL"), gruppo: h.col("gruppo auto fatturato") };
  return m.slice(h.riga + 1).flatMap((r): FatturaRiga[] => {
    const targa = normTarga(testo(r[c.targa]));
    const base = numero(r[c.base]), gg = numero(r[c.gg]);
    if (!targa || base === null) return [];
    const dal = dataIso(r[c.dal]), al = dataIso(r[c.al]);
    // canone a 30 giorni solo se i giorni fatturati coprono quasi tutto il mese
    const pieno = (gg ?? 0) >= 28;
    return [{ fornitore: "EUROPCAR", fattura: testo(r[c.nf]).replace(/\.0$/, ""), targa, voce: "CANONE", dal, al, mese: dal?.slice(0, 7) ?? null, importo: pieno && gg ? Math.round((base / gg) * 30 * 100) / 100 : base, mesePieno: pieno, cdc: null, gruppo: testo(r[c.gruppo]) || undefined, giorni: gg ?? undefined }];
  });
}
