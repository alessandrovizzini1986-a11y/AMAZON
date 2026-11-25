/**
 * Festività italiane per le decorazioni stagionali della pagina di login.
 *
 * Modulo puro e offline: niente rete, niente DOM, solo la data che gli si passa.
 * Conta la data LOCALE della macchina (getFullYear / getMonth / getDate), non quella UTC:
 * a Roma alle 00:30 del 25 dicembre è già Natale anche se in UTC è ancora il 24.
 *
 * Regola di precedenza: al massimo una festività per giorno; se due finestre si sovrappongono
 * vince la più corta in giorni, a parità di durata la prima di FESTIVITA (ordine di calendario).
 */
import { pasqua } from "@/domain/pasqua";

export type FestivitaId =
  | "capodanno" | "epifania" | "pasqua" | "liberazione" | "lavoro" | "repubblica"
  | "ferragosto" | "sanfrancesco" | "ognissanti" | "immacolata" | "natale";

/** Animazione del canvas. */
export type Effetto = "scintille" | "stelle" | "primavera" | "tricolore" | "morbide" | "bokeh" | "foglie" | "lumi" | "neve";
/** Micro-accento SVG sulla card (resta, fermo, anche con prefers-reduced-motion). */
export type Accento = "stella" | "fiocco" | "foglia" | "tricolore";

export type Festivita = { id: FestivitaId; effetto: Effetto; accento?: Accento };

/** In ordine di calendario: è anche l'ordine che decide a parità di durata. */
export const FESTIVITA: Record<FestivitaId, Omit<Festivita, "id">> = {
  capodanno: { effetto: "scintille" }, //                         31/12 – 2/1: fuochi geometrici lenti
  epifania: { effetto: "stelle", accento: "stella" }, //           5 – 6/1: polvere di stelle dorate
  pasqua: { effetto: "primavera" }, //                             Sabato Santo – Lunedì dell'Angelo
  liberazione: { effetto: "tricolore", accento: "tricolore" }, //  25/4
  lavoro: { effetto: "morbide" }, //                               1/5: ambra e blu brand
  repubblica: { effetto: "tricolore", accento: "tricolore" }, //   2/6
  ferragosto: { effetto: "bokeh" }, //                             14 – 16/8
  sanfrancesco: { effetto: "foglie", accento: "foglia" }, //       4/10, festa nazionale dal 2026 (L. 151/2025)
  ognissanti: { effetto: "lumi" }, //                              1/11: bagliore fermo e pochissimi lumi
  immacolata: { effetto: "neve", accento: "fiocco" }, //           8/12
  natale: { effetto: "neve", accento: "fiocco" }, //               15 – 26/12
};

export const festivita = (id: FestivitaId): Festivita => ({ id, ...FESTIVITA[id] });

/** Giorno progressivo di una data di calendario (UTC, senza ore): differenze e confronti esatti, senza fusi né ora legale. */
export const giorno = (anno: number, mese: number, g: number) => Math.round(Date.UTC(anno, mese - 1, g) / 86_400_000);

/** Pasqua (algoritmo anonimo gregoriano di Meeus/Jones/Butcher, lo stesso dei festivi dei Costi) come giorno progressivo. */
export function giornoPasqua(anno: number): number {
  const [a, m, g] = pasqua(anno).split("-").map(Number);
  return giorno(a, m, g);
}

/** Finestra di una festività: dal / al inclusi, in giorni progressivi. */
export type Finestra = { id: FestivitaId; dal: number; al: number };

/** Finestre che INIZIANO nell'anno (Capodanno parte il 31/12 e finisce il 2/1 dell'anno dopo). */
export function finestreAnno(anno: number): Finestra[] {
  const f = (id: FestivitaId, m: number, g: number, mAl = m, gAl = g, annoAl = anno): Finestra =>
    ({ id, dal: giorno(anno, m, g), al: giorno(annoAl, mAl, gAl) });
  const p = giornoPasqua(anno);
  return [
    f("capodanno", 12, 31, 1, 2, anno + 1),
    f("epifania", 1, 5, 1, 6),
    { id: "pasqua", dal: p - 1, al: p + 1 },
    f("liberazione", 4, 25),
    f("lavoro", 5, 1),
    f("repubblica", 6, 2),
    f("ferragosto", 8, 14, 8, 16),
    ...(anno >= 2026 ? [f("sanfrancesco", 10, 4)] : []),
    f("ognissanti", 11, 1),
    f("immacolata", 12, 8),
    f("natale", 12, 15, 12, 26),
  ];
}

/** La festività del giorno tra finestre che possono sovrapporsi: vince la più corta, a pari durata la prima dell'elenco. */
export function scegli(finestre: readonly Finestra[], g: number): FestivitaId | null {
  let scelta: Finestra | null = null;
  for (const w of finestre) {
    if (g < w.dal || g > w.al) continue;
    if (!scelta || w.al - w.dal < scelta.al - scelta.dal) scelta = w;
  }
  return scelta?.id ?? null;
}

/** Festività attiva alla data (locale), o null nei giorni ordinari e con una data non valida. */
export function festivitaDelGiorno(d: Date): Festivita | null {
  const anno = d.getFullYear();
  if (!Number.isFinite(anno)) return null;
  // l'anno prima serve per il Capodanno iniziato il 31/12
  const id = scegli([...finestreAnno(anno - 1), ...finestreAnno(anno)], giorno(anno, d.getMonth() + 1, d.getDate()));
  return id ? festivita(id) : null;
}

/** Millisecondi fino a un secondo dopo la prossima mezzanotte locale (corretto anche nei giorni di cambio d'ora). */
export function msAllaMezzanotte(d: Date): number {
  return Math.max(1_000, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 1).getTime() - d.getTime());
}

// ── Anteprima per i test: ?holiday=natale, ?holiday=2giugno, ?holiday=none …
export const PARAM_ANTEPRIMA = "holiday";

/**
 * Nomi accettati oltre agli id, normalizzati (minuscolo, senza accenti, spazi e simboli: "1° Maggio" → "1maggio").
 * Pochi e corti: questo modulo si scarica con la login tutti i giorni.
 */
const ALIAS: Record<string, FestivitaId> = {
  "31dicembre": "capodanno", "1gennaio": "capodanno", befana: "epifania", "6gennaio": "epifania",
  pasquetta: "pasqua", "25aprile": "liberazione", "1maggio": "lavoro", "2giugno": "repubblica",
  "15agosto": "ferragosto", "4ottobre": "sanfrancesco", "1novembre": "ognissanti", "8dicembre": "immacolata",
  "25dicembre": "natale", santostefano: "natale",
};
const NESSUNA = ["none", "nessuna", "off"];
const proprio = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Festività forzata dal parametro ?holiday= della query string (es. window.location.search).
 * "none" spegne le decorazioni anche in un giorno di festa; null se il parametro manca o non è riconosciuto.
 */
export function leggiAnteprima(search: string): FestivitaId | "none" | null {
  const v = new URLSearchParams(search).get(PARAM_ANTEPRIMA);
  if (v == null) return null;
  const k = v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (NESSUNA.includes(k)) return "none";
  if (proprio(FESTIVITA, k)) return k as FestivitaId;
  return proprio(ALIAS, k) ? ALIAS[k] : null;
}

/** Festività da mostrare: quella forzata dall'anteprima, altrimenti quella del giorno. */
export function risolviFestivita(adesso: Date, search = ""): Festivita | null {
  const a = leggiAnteprima(search);
  if (a === "none") return null;
  return a ? festivita(a) : festivitaDelGiorno(adesso);
}
