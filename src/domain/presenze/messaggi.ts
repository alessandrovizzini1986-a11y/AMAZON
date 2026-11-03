/**
 * Messaggi Teams "pronti da incollare" per gli Operations di ogni station.
 * Tutti i testi dei template stanno qui: per cambiarli basta modificare questo file.
 * Formato: testo semplice (righe "- " e tabulazioni) + tabella HTML per "Copia tabella".
 */
import { addDays, weekday } from "./grid";

export type Sezione = {
  titolo: string;
  colonne: string[];
  righe: string[][];
};

export type Messaggio = { station: string; testo: string; html: string; nAnomalie: number };

export const TESTI = {
  saluto: (referente: string | null) => (referente ? `Ciao ${referente}` : "Ciao"),
  aperturaSettimanale: (saluto: string, station: string, da: string, a: string, entro: string) =>
    `${saluto}, controllo presenze ${station} periodo ${da}–${a}. Ci servono queste verifiche entro ${entro}:`,
  aperturaFineMese: (saluto: string, station: string, mese: string, entro: string) =>
    `${saluto}, controllo di fine mese ${station} (${mese}): tracking SIC vs Zucchetti. Ci servono queste verifiche entro ${entro}:`,
  chiusura: "Grazie, rispondete correggendo direttamente il tracking e avvisateci.",
  piu1: "TRASFERTA PAGATA SENZA ROTTA AMAZON (+1)",
  meno1: "ROTTA AMAZON MA ZERO ORE NEL TRACKING (-1)",
  h: "ORE NEL TRACKING MA ASSENTE SU AMAZON (H)",
  a: "DRIVER SU AMAZON NON PRESENTE NEI TRACKING (A)",
  ore: "ORE GIORNALIERE OLTRE 10 O VALORE ANOMALO (ORE)",
  acc: "ACCORDO DI DOMENICA (SOMMINISTRATI) (ACC)",
  delta: "ORE DIVERSE TRA TRACKING E ZUCCHETTI",
  nonAbbinati: "LAVORATORI NON ABBINATI",
  seiDom: "6 GIORNI + DOMENICA",
  consecutivi: "PIÙ DI 6 GIORNI CONSECUTIVI",
  chiedi: {
    piu1: "cosa ha fatto? se mezzi/altra station/corso scrivetelo nella riga RIPOSO",
    meno1: "manca la giornata nel tracking: inseritela",
    h: "cosa ha fatto? se mezzi/ufficio/altra station scrivetelo nella riga RIPOSO",
    ore: "verificare le ore del giorno e correggere il tracking (errore di digitazione?)",
    acc: "la domenica degli STD non va nella riga Accordo: cancellare la cella",
    delta: "verificare quale dei due è giusto e correggere",
  },
};

/** dd/mm */
export const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Oggi + n giorni lavorativi (lun–ven), in dd/mm/aaaa. */
export function entroGiorniLavorativi(oggiIso: string, n = 2): string {
  let d = oggiIso;
  let k = 0;
  while (k < n) {
    d = addDays(d, 1);
    if (weekday(d) < 5) k++;
  }
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Compone il messaggio: apertura, sezioni non vuote, chiusura. */
export function componi(station: string, apertura: string, sezioni: Sezione[]): Messaggio {
  const piene = sezioni.filter((s) => s.righe.length > 0);
  const testo = [
    apertura,
    "",
    ...piene.flatMap((s) => [s.titolo, s.colonne.join("\t"), ...s.righe.map((r) => "- " + r.join("\t")), ""]),
    TESTI.chiusura,
  ].join("\n");
  const html = [
    `<p>${esc(apertura)}</p>`,
    ...piene.map(
      (s) =>
        `<p><b>${esc(s.titolo)}</b></p><table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse"><thead><tr>${s.colonne
          .map((c) => `<th style="text-align:left">${esc(c)}</th>`)
          .join("")}</tr></thead><tbody>${s.righe.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
    ),
    `<p>${esc(TESTI.chiusura)}</p>`,
  ].join("");
  return { station, testo, html, nAnomalie: piene.reduce((s, x) => s + x.righe.length, 0) };
}
