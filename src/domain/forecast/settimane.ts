/** Settimane Amazon (domenica–sabato) identificate dalla data della domenica: niente ambiguità a cavallo d'anno. */
import { amazonWeek } from "@/domain/fatture/parser";

const D = (iso: string) => new Date(iso + "T00:00:00Z");
export const isoD = (d: Date) => d.toISOString().slice(0, 10);
export const addGiorni = (iso: string, n: number) => { const d = D(iso); d.setUTCDate(d.getUTCDate() + n); return isoD(d); };

/** Domenica della settimana Amazon che contiene il giorno. */
export const inizioSettimana = (iso: string) => addGiorni(iso, -D(iso).getUTCDay());
/** Numero settimana Amazon (come la colonna WEEK di fatt_2026). */
export const numeroSettimana = (inizio: string) => amazonWeek(D(inizio));
/** Settimana chiusa = terminata (sabato) da almeno `giorni` giorni rispetto a oggi. */
export const chiusa = (inizio: string, oggi: string, giorni = 14) => addGiorni(inizio, 6 + giorni) <= oggi;
export const giorniSettimana = (inizio: string) => Array.from({ length: 7 }, (_, i) => addGiorni(inizio, i));

/**
 * Settimana con il fatturato completo per una DS: finita (oggi dopo il sabato) e con righe di fattura in tutti e 7 i giorni.
 * Così il fatturato si vede appena le fatture sono caricate, senza aspettare i 14 giorni di `chiusa`.
 */
export function fatturataTutta(inizio: string, oggi: string, giorniConFattura: Set<string>) {
  return addGiorni(inizio, 6) < oggi && giorniSettimana(inizio).every((g) => giorniConFattura.has(g));
}
