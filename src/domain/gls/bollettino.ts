/**
 * Bollettino di spedizione GLS (Mod. 04/Rev. 5): scrive i dati sul modulo originale (public/gls/bollettino.pdf),
 * che è un PDF senza campi compilabili. Le coordinate sono in punti dall'angolo in alto a sinistra, prese dalle
 * linee del modulo. Funziona nel browser e nei test: nessuna dipendenza da server.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type Parte = { nome: string; via: string; citta: string; cap: string; telefono: string; email: string };
export const SERVIZI = { nazionale: "Nazionale", express: "Express", safeplus: "Safe plus", airfreight: "Airfreight", parcel: "Parcel", groupage: "Groupage" } as const;
export type Servizio = keyof typeof SERVIZI;
export type Bollettino = {
  numero: string;
  mittente: Parte; rifMittente: string;
  destinatario: Parte; fermoDeposito: boolean;
  colli: string; pesoKg: string; dimensioni: [string, string, string]; contenuto: string;
  contrassegno: string; modalitaIncasso: string;
  servizi: Servizio[];
  porto: "" | "franco" | "assegnato" | "afm"; afmCodice: string;
  assicurazione: "" | "no" | "si" | "1010"; valore: string;
  accessori: string[];
  note: string; data: string; ora: string;
};

export const parteVuota = (): Parte => ({ nome: "", via: "", citta: "", cap: "", telefono: "", email: "" });
export const bollettinoVuoto = (oggi = ""): Bollettino => ({
  numero: "", mittente: parteVuota(), rifMittente: "", destinatario: parteVuota(), fermoDeposito: false,
  colli: "1", pesoKg: "", dimensioni: ["", "", ""], contenuto: "", contrassegno: "", modalitaIncasso: "",
  servizi: ["nazionale"], porto: "franco", afmCodice: "", assicurazione: "no", valore: "", accessori: [], note: "", data: oggi, ora: "",
});

const numero = (s: string) => Number(s.trim().replace(/\./g, "").replace(",", "."));
/** "1.234,5" → { interi: "1234", decimali: "50" }; null se non è un importo. */
export function importo(s: string): { interi: string; decimali: string } | null {
  if (!s.trim()) return null;
  const n = numero(s);
  if (!Number.isFinite(n) || n < 0) return null;
  const [i, d] = n.toFixed(2).split(".");
  return { interi: i, decimali: d };
}

/** Cosa manca o non torna, in parole semplici. Lista vuota = il bollettino si può stampare. */
export function controlla(b: Bollettino): string[] {
  const e: string[] = [];
  const parte = (p: Parte, chi: string) => {
    if (!p.nome.trim()) e.push(`Manca il nome del ${chi}.`);
    if (!p.via.trim()) e.push(`Manca la via del ${chi}.`);
    if (!p.citta.trim()) e.push(`Manca la città del ${chi}.`);
    if (!/^\d{5}$/.test(p.cap.trim())) e.push(`Il CAP del ${chi} deve avere 5 cifre.`);
  };
  parte(b.mittente, "mittente"); parte(b.destinatario, "destinatario");
  if (!(Number(b.colli) >= 1) || !Number.isInteger(Number(b.colli))) e.push("Indica il numero di colli (almeno 1).");
  if (b.pesoKg.trim() && !(numero(b.pesoKg) > 0)) e.push("Il peso non è un numero.");
  if (b.fermoDeposito && !b.destinatario.telefono.trim()) e.push("Con il fermo deposito serve il telefono del destinatario.");
  if (b.contrassegno.trim()) {
    const c = importo(b.contrassegno);
    if (!c) e.push("Il contrassegno non è un importo.");
    else if (c.interi.length > 5) e.push("Il contrassegno ha troppe cifre per il modulo (massimo 99.999,99).");
    if (!b.modalitaIncasso.trim()) e.push("Con il contrassegno indica la modalità di incasso.");
  }
  if (b.assicurazione === "si" && !importo(b.valore)) e.push("Con l'assicurazione indica il valore in €.");
  if (b.porto === "afm" && !b.afmCodice.trim()) e.push("Con AFM indica il codice cliente.");
  if (b.accessori.filter((a) => a.trim()).length > 5) e.push("Il modulo ha spazio per 5 servizi accessori.");
  return e;
}

/** Riga dello storico: quello che serve per ritrovare un bollettino senza aprirlo. */
export type RigaStoricoGls = { id: string; quando: string; chi: string; azioni: string[]; dataSpedizione: string; numero: string; mittente: string; destinatario: string; citta: string; cap: string; colli: string; pesoKg: string; contrassegno: string; dati: Bollettino };
export const AZIONI_GLS = { scarica: "scaricato", stampa: "stampato", invia: "inviato" } as const;
export type AzioneGls = keyof typeof AZIONI_GLS;

/** Testo stabile dei dati (chiavi in ordine, spazi tolti ai bordi): due bollettini uguali danno lo stesso testo. */
export function testoStabile(b: Bollettino): string {
  const pulisci = (v: unknown): unknown => typeof v === "string" ? v.trim() : Array.isArray(v) ? v.map(pulisci) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, pulisci((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(pulisci(b));
}

/** Cerca nello storico: tutte le parole devono comparire in destinatario, città, CAP, numero, mittente, riferimento, contenuto, note o data. */
export function cercaStorico(righe: RigaStoricoGls[], testo: string): RigaStoricoGls[] {
  const parole = testo.toLowerCase().split(/\s+/).filter(Boolean);
  if (!parole.length) return righe;
  return righe.filter((r) => {
    const dove = [r.destinatario, r.citta, r.cap, r.numero, r.mittente, r.chi, r.dataSpedizione, r.dataSpedizione.split("-").reverse().join("/"), r.dati.rifMittente, r.dati.contenuto, r.dati.note, r.dati.destinatario.telefono, r.dati.destinatario.via].join(" ").toLowerCase();
    return parole.every((p) => dove.includes(p));
  });
}

export function nomeFile(b: Bollettino): string {
  const chi = b.destinatario.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "spedizione";
  return `Bollettino_GLS_${chi}${b.data ? `_${b.data}` : ""}.pdf`;
}

const ALTEZZA = 430.866, INCHIOSTRO = rgb(0.05, 0.05, 0.1);

/** Testo che il font del modulo sa scrivere: virgolette e trattini tipografici diventano semplici, il resto perde l'accento o diventa "?". */
function pulisci(font: PDFFont, s: string): string {
  let out = "";
  for (const c of s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim()) {
    try { font.encodeText(c); out += c; } catch {
      const base = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
      try { font.encodeText(base); out += base; } catch { out += "?"; }
    }
  }
  return out;
}

/** Scrive i dati sul modulo e restituisce il PDF (pagina 1 compilata, pagina 2 con le condizioni di trasporto). */
export async function compilaBollettino(modulo: ArrayBuffer | Uint8Array, b: Bollettino): Promise<Uint8Array> {
  const doc = await PDFDocument.load(modulo);
  const font = await doc.embedFont(StandardFonts.Helvetica), grassetto = await doc.embedFont(StandardFonts.HelveticaBold);
  const p: PDFPage = doc.getPage(0);

  /** Testo su una riga: da x, con la base a yBase (dall'alto), dentro larghezzaMax; si rimpicciolisce e poi si tronca. */
  const riga = (testo: string, x: number, yBase: number, larghezzaMax: number, corpo = 9, f: PDFFont = font) => {
    let t = pulisci(f, testo); if (!t) return;
    let c = corpo;
    while (c > 5.5 && f.widthOfTextAtSize(t, c) > larghezzaMax) c -= 0.25;
    while (t.length > 1 && f.widthOfTextAtSize(t, c) > larghezzaMax) t = t.slice(0, -2).trimEnd() + "…";
    p.drawText(t, { x, y: ALTEZZA - yBase, size: c, font: f, color: INCHIOSTRO });
  };
  /** Testo centrato in una casella. */
  const centro = (testo: string, x: number, yAlto: number, w: number, h: number, corpo = 10, f: PDFFont = font) => {
    let t = pulisci(f, testo); if (!t) return;
    let c = corpo;
    while (c > 5.5 && f.widthOfTextAtSize(t, c) > w - 3) c -= 0.25;
    while (t.length > 1 && f.widthOfTextAtSize(t, c) > w - 3) t = t.slice(0, -1);
    p.drawText(t, { x: x + (w - f.widthOfTextAtSize(t, c)) / 2, y: ALTEZZA - (yAlto + h / 2 + c * 0.35), size: c, font: f, color: INCHIOSTRO });
  };
  /** Testo su più righe (a capo tra le parole), al massimo `righe`. */
  const blocco = (testo: string, x: number, yBase: number, w: number, righe: number, corpo: number, interlinea: number, primaX = x, primaW = w) => {
    const parole = pulisci(font, testo).split(" ").filter(Boolean); const out: string[] = []; let cur = "";
    for (const par of parole) {
      const lim = out.length === 0 ? primaW : w, prova = cur ? `${cur} ${par}` : par;
      if (font.widthOfTextAtSize(prova, corpo) <= lim || !cur) cur = prova; else { out.push(cur); cur = par; }
    }
    if (cur) out.push(cur);
    if (out.length > righe) { out[righe - 1] = out.slice(righe - 1).join(" "); out.length = righe; }
    out.forEach((t, i) => riga(t, i === 0 ? primaX : x, yBase + i * interlinea, i === 0 ? primaW : w, corpo));
  };
  /** Crocetta nel quadratino (7,2 pt) con l'angolo in alto a sinistra in x, yAlto. */
  const croce = (x: number, yAlto: number) => {
    const a = 1.3, l = 7.2, y = ALTEZZA - yAlto;
    p.drawLine({ start: { x: x + a, y: y - a }, end: { x: x + l - a, y: y - l + a }, thickness: 1.3, color: INCHIOSTRO });
    p.drawLine({ start: { x: x + a, y: y - l + a }, end: { x: x + l - a, y: y - a }, thickness: 1.3, color: INCHIOSTRO });
  };
  const caselle = (cifre: string, x0: number, passo: number, yAlto: number, h: number, n: number) => { cifre.slice(0, n).split("").forEach((c, i) => centro(c, x0 + i * passo, yAlto, passo, h, 11)); };

  riga(b.numero, 241, 106.5, 320, 14, grassetto);

  const parte = (q: Parte, x0: number) => {
    const fine = x0 + 262;
    riga(q.nome, x0 + (x0 < 200 ? 32 : 43), 127.3, fine - x0 - (x0 < 200 ? 34 : 45), 9.5, grassetto);
    riga(q.via, x0 + 15, 144.3, fine - x0 - 17);
    riga(q.citta, x0 + 20, 161.3, 140);
    caselle(q.cap.trim(), x0 + 176.3, 17.1, 150.1, 16.3, 5);
    riga(q.telefono, x0 + 31, 178.3, 84);
    riga(q.email, x0 + 141, 178.3, fine - x0 - 143, 8.5);
  };
  parte(b.mittente, 35); parte(b.destinatario, 301.3);
  riga(b.rifMittente, 77, 195.3, 216);
  if (b.fermoDeposito) croce(301.8, 188.7);

  centro(b.colli, 30.9, 220.9, 51, 22.7, 12);
  centro(b.pesoKg, 81.9, 220.9, 51, 22.7, 12);
  b.dimensioni.forEach((d, i) => centro(d, 132.9 + i * 50.95, 220.9, 51, 22.7, 11));
  blocco(b.contenuto, 288.5, 229.5, 79.5, 2, 7.5, 8.5);
  const c = importo(b.contrassegno);
  if (c && c.interi.length <= 5) {
    c.interi.padStart(5, " ").split("").forEach((x, i) => centro(x.trim(), 374.2 + i * 11.33, 221.4, 11.33, 16.3, 10.5));
    c.decimali.split("").forEach((x, i) => centro(x, 439.4 + i * 11.3, 221.4, 11.3, 16.3, 10.5));
  }
  riga(b.modalitaIncasso, 486, 234.6, 71, 8.5);

  const dove: Record<Servizio, [number, number]> = { nazionale: [35.8, 253.9], express: [35.8, 265.8], safeplus: [98.7, 253.9], airfreight: [98.7, 265.8], parcel: [162.6, 253.9], groupage: [162.6, 265.8] };
  for (const s of new Set(b.servizi)) if (dove[s]) croce(...dove[s]);
  if (b.porto === "franco") croce(213.3, 253.9);
  if (b.porto === "assegnato") croce(213.3, 265.8);
  if (b.porto === "afm") { croce(213.3, 277.8); riga(b.afmCodice, 300, 282.8, 80, 8.5); }
  if (b.assicurazione === "no") croce(390.8, 263.6);
  if (b.assicurazione === "si") { croce(418.8, 263.6); const v = importo(b.valore); if (v) riga(`${Number(v.interi).toLocaleString("it-IT")},${v.decimali}`, 498.5, 268.6, 59, 8.5); }
  if (b.assicurazione === "1010") croce(390.8, 275.6);

  b.accessori.map((a) => a.trim()).filter(Boolean).slice(0, 5).forEach((a, i) => { const x = [35.8, 143.4, 250.9, 358.5, 466.1][i]; croce(x, 304.2); riga(a, x + 10.6, 309.2, 83, 8); });
  blocco(b.note, 35, 334.3, 523, 2, 8.5, 11, 57, 501);

  if (/^\d{4}-\d{2}-\d{2}$/.test(b.data)) riga(b.data.split("-").reverse().join("/"), 409.5, 376.5, 65, 9);
  riga(b.ora, 495, 376.5, 62, 9);

  doc.setTitle(`Bollettino di spedizione GLS${b.destinatario.nome ? ` - ${pulisci(font, b.destinatario.nome)}` : ""}`);
  return doc.save();
}
