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
  /** Verifica tracking: tono diretto, al singolare, con il solo nome di battesimo */
  salutoNome: (referente: string | null) => (referente ? `Ciao ${referente.trim().split(/\s+/)[0]}` : "Ciao"),
  aperturaVerifica: (saluto: string, station: string, mese: string, finoA: string, punti: number) => `${saluto}, ${punti === 1 ? "c'è 1 punto" : `ci sono ${punti} punti`} da verificare sui tracking di ${station} di ${mese} (fino al ${finoA}):`,
  chiusuraVerifica: "Puoi verificare e farmi sapere? Grazie!",
  piu1: "TRASFERTA PAGATA SENZA ROTTA AMAZON (+1)",
  meno1: "ROTTA AMAZON MA ZERO ORE NEL TRACKING (-1)",
  h: "ORE NEL TRACKING MA ASSENTE SU AMAZON (H)",
  a: "DRIVER SU AMAZON NON PRESENTE NEI TRACKING (A)",
  ore: "ORE GIORNALIERE OLTRE 10 O VALORE ANOMALO (ORE)",
  acc: "ACCORDO DI DOMENICA (SOMMINISTRATI) (ACC)",
  delta: "ORE DIVERSE TRA TRACKING E ZUCCHETTI",
  nonAbbinati: "LAVORATORI NON ABBINATI",
  seiDom: "6° GIORNO DI DOMENICA (5 GIORNI + LA DOMENICA)",
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
export function componi(station: string, apertura: string, sezioni: Sezione[], chiusura: string = TESTI.chiusura): Messaggio {
  const piene = sezioni.filter((s) => s.righe.length > 0);
  const testo = [
    apertura,
    "",
    ...piene.flatMap((s) => [s.titolo, s.colonne.join("\t"), ...s.righe.map((r) => "- " + r.join("\t")), ""]),
    chiusura,
  ].join("\n");
  const html = [
    `<p>${esc(apertura)}</p>`,
    ...piene.map(
      (s) =>
        `<p><b>${esc(s.titolo)}</b></p><table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse"><thead><tr>${s.colonne
          .map((c) => `<th style="text-align:left">${esc(c)}</th>`)
          .join("")}</tr></thead><tbody>${s.righe.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
    ),
    `<p>${esc(chiusura)}</p>`,
  ].join("");
  return { station, testo, html, nAnomalie: piene.reduce((s, x) => s + x.righe.length, 0) };
}

// ───────────── Verifica tracking: una tabellina sola per station, un punto per riga (chiesto dagli OS il 25/11/2026) ─────────────

export type PuntoVerifica = { driver: string; tracking: string; quando: string; cosa: string };

const ordineGiorno = (q: string) => { const m = /^(\d\d)\/(\d\d)/.exec(q); return m ? `${m[2]}${m[1]}` : "9999"; };

/**
 * Dalle richieste ai punti della tabellina: un punto per riga, ordinati per driver e giorno.
 * Una richiesta di settimana con più giorni ("12/11: … · 14/11: …") diventa una riga per giorno.
 */
export function puntiVerifica(richieste: { driver: string; pop: string; periodo: string; testo: string; breve?: string | null }[]): PuntoVerifica[] {
  const punti = richieste.flatMap((r) => (r.breve || r.testo).split(" · ").map((pezzo) => {
    const m = /^(\d\d\/\d\d): (.+)$/.exec(pezzo);
    return { driver: r.driver, tracking: r.pop, quando: m ? m[1] : /^\d\d\/\d{4}$/.test(r.periodo) ? "nel mese" : r.periodo, cosa: m ? m[2] : pezzo };
  }));
  return punti.sort((a, b) => a.driver.localeCompare(b.driver) || ordineGiorno(a.quando).localeCompare(ordineGiorno(b.quando)) || a.quando.localeCompare(b.quando));
}

/** Messaggio con una tabella sola: Driver | Tracking | Quando | Da verificare. Il nome del driver compare solo sulla sua prima riga. */
export function componiTabellina(station: string, apertura: string, punti: PuntoVerifica[], chiusura: string = TESTI.chiusuraVerifica): Messaggio {
  const primo = (i: number) => i === 0 || punti[i - 1].driver !== punti[i].driver;
  const cella = "padding:3px 8px;border:1px solid #c8c8c8;vertical-align:top";
  const testo = [apertura, "", ...punti.flatMap((p, i) => [...(primo(i) ? [`${p.driver} (${p.tracking})`] : []), `  • ${p.quando} — ${p.cosa}`]), "", chiusura].join("\n");
  const html = [
    `<p>${esc(apertura)}</p>`,
    `<table cellspacing="0" style="border-collapse:collapse;font-size:13px"><thead><tr>${["Driver", "Tracking", "Quando", "Da verificare"].map((c) => `<th style="${cella};text-align:left;background:#f0f0f0">${c}</th>`).join("")}</tr></thead><tbody>`,
    ...punti.map((p, i) => `<tr><td style="${cella}">${primo(i) ? `<b>${esc(p.driver)}</b>` : ""}</td><td style="${cella}">${primo(i) ? esc(p.tracking) : ""}</td><td style="${cella};white-space:nowrap">${esc(p.quando)}</td><td style="${cella}">${esc(p.cosa)}</td></tr>`),
    `</tbody></table>`,
    `<p>${esc(chiusura)}</p>`,
  ].join("");
  return { station, testo, html, nAnomalie: punti.length };
}
