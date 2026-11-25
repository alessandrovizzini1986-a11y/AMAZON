/** Costanti e piccoli formati della pagina "Carburante: Q8 e telematica" (server e browser). */
import { ETICHETTA_STATO, type Stato } from "@/domain/carburante/riconciliazione";
import type { DatiRiconciliazione, RigaPagina } from "@/lib/carburante/riconciliazione";

/** riga come arriva al browser: senza i rifornimenti grezzi e con il minimo dei pagamenti Q8 (pagina più leggera) */
export type RigaVista = Omit<RigaPagina, "eventi" | "q8"> & { q8: { identificativo: string | null; impianto: string | null; prodotto: string | null }[] };
export type DatiVista = Omit<DatiRiconciliazione, "righe"> & { righe: RigaVista[] };
export const perVista = (d: DatiRiconciliazione): DatiVista => ({
  ...d,
  righe: d.righe.map(({ eventi: _e, q8, ...r }) => ({ ...r, q8: q8.map((x) => ({ identificativo: x.identificativo, impianto: x.impianto, prodotto: x.prodotto })) })),
});

/** chiave in TourVisto e in localStorage della guida di questa pagina */
export const CHIAVE_GUIDA = "guida:carburante";

/** eventi del browser per aprire guida e pannello dai pulsanti dell'intestazione */
export const EVENTO_GUIDA = "carburante:apri-guida";
export const EVENTO_DATI = "carburante:apri-dati";

export const MOTIVI_GIUSTIFICA = ["Furgone sostitutivo", "Sensore guasto", "Errore importazione", "Pagata con altra carta", "Tanica o attrezzatura", "Altro"] as const;

/** badge di ogni tipo: icona + testo, mai solo colore */
export const STILE_STATO: Record<Stato, { icona: string; colore: string; classe: string; testo: string }> = {
  SERBATOIO_FERMO: { icona: "🔴", colore: "rosso", classe: "badge-danger", testo: ETICHETTA_STATO.SERBATOIO_FERMO },
  LITRI: { icona: "🟠", colore: "arancione", classe: "badge bg-orange-100 text-orange-800", testo: ETICHETTA_STATO.LITRI },
  LUOGO: { icona: "🟡", colore: "giallo", classe: "badge bg-yellow-100 text-yellow-900", testo: ETICHETTA_STATO.LUOGO },
  SENZA_Q8: { icona: "🔵", colore: "blu", classe: "badge-info", testo: ETICHETTA_STATO.SENZA_Q8 },
  REGOLARE: { icona: "🟢", colore: "verde", classe: "badge-ok", testo: ETICHETTA_STATO.REGOLARE },
  NON_VERIFICABILE: { icona: "⚪", colore: "grigio", classe: "badge-neutral", testo: ETICHETTA_STATO.NON_VERIFICABILE },
};

const numero = (x: number, dec: number) => x.toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec });
/** litri con un decimale: "12,3 L" */
export const litri = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${numero(x, 1)} L`);
/** litri con il segno: "−12,3 L", "+4,0 L" */
export const litriConSegno = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${numero(Math.abs(x), 1)} L`);
export const euro = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${numero(x, 2)} €`);
/** "2026-10-07" → "07/10" */
export const giornoBreve = (g: string) => `${g.slice(8, 10)}/${g.slice(5, 7)}`;
/** "2026-10-07" → "07/10/2026" */
export const giornoLungo = (g: string | null | undefined) => (g ? `${g.slice(8, 10)}/${g.slice(5, 7)}/${g.slice(0, 4)}` : "—");
export const quando = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
