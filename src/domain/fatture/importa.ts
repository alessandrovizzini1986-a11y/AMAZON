/**
 * Stato di ogni file di un caricamento (SPEC §2): nessun file sparisce dal report.
 */
import type { Fattura } from "./parser";
import { normalizzaNumero, progressivo } from "./numero";
import { classifica } from "./classifica";

export type Lettura = { file: string; sha256: string; fattura?: Fattura; errore?: string };
/** Dati del registro per un numero; nRighe/sommaAvere/importoDovuto servono a riconoscere una fattura rivista da Amazon. */
export type InfoRegistro = { esportataIl: string | null; presenteInFatt2026Il: string | null; pdfSha256?: string | null; nRighe?: number; sommaAvere?: number; importoDovuto?: number };
/** "da sostituire": stesso numero già esportato, ma il PDF nuovo ha righe o importi diversi (fattura che era in revisione). */
export type Stato = "nuova" | "da sostituire" | "già presente" | "doppione nel caricamento" | "errore";
export type EsitoFile = { file: string; sha256: string; stato: Stato; motivo: string; numero: string | null; fattura?: Fattura };

const gg = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });

/** Fattura letta ma inutilizzabile (numero mancante o 0 righe): mai righe inventate. */
export function erroreFattura(f: Fattura): string | null {
  if (!f.numero || f.righe.length === 0 || f.template === "?") return "template non riconosciuto";
  if (!f.ds) return "station (DS) non trovata nel PDF";
  return null;
}

/** Il PDF ha righe o importi diversi da quelli registrati (solo se il registro li conosce). */
function cambiata(r: InfoRegistro, f: Fattura): boolean {
  if (r.nRighe === undefined || r.sommaAvere === undefined) return false;
  if (r.nRighe !== f.righe.length) return true;
  if (Math.abs(r.sommaAvere - f.sommaAvere) > 0.005) return true;
  return r.importoDovuto !== undefined && f.importoDovuto !== null && Math.abs(r.importoDovuto - f.importoDovuto) > 0.005;
}

export function statiCaricamento(letture: Lettura[], registro: Record<string, InfoRegistro>): EsitoFile[] {
  const visti = new Set<string>();
  return letture.map((l): EsitoFile => {
    const base = { file: l.file, sha256: l.sha256 };
    if (l.errore || !l.fattura) return { ...base, stato: "errore", motivo: l.errore ?? "file illeggibile", numero: null };
    const err = erroreFattura(l.fattura);
    if (err) return { ...base, stato: "errore", motivo: err, numero: l.fattura.numero ? normalizzaNumero(l.fattura.numero) : null };
    const numero = normalizzaNumero(l.fattura.numero);
    if (visti.has(numero)) return { ...base, stato: "doppione nel caricamento", motivo: `${numero} è già in un altro file di questo caricamento`, numero };
    visti.add(numero);
    const r = registro[numero];
    if (r && (r.esportataIl || r.presenteInFatt2026Il) && cambiata(r, l.fattura)) {
      const e2 = (x: number) => x.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return { ...base, stato: "da sostituire", motivo: `rivista da Amazon: prima ${r.nRighe} righe, ${e2(r.sommaAvere!)} € imponibile; ora ${l.fattura.righe.length} righe, ${e2(l.fattura.sommaAvere)} €`, numero, fattura: l.fattura };
    }
    if (r && (r.esportataIl || r.presenteInFatt2026Il)) {
      const motivi = [r.esportataIl ? `esportata il ${gg(r.esportataIl)}` : "", r.presenteInFatt2026Il ? "presente in fatt_2026" : ""].filter(Boolean);
      return { ...base, stato: "già presente", motivo: motivi.join(" · "), numero, fattura: l.fattura };
    }
    return { ...base, stato: "nuova", motivo: "", numero, fattura: l.fattura };
  });
}

/** Delta tra importo del PDF e somma delle righe: normale tra −3 e +3 € (IVA arrotondata sul riepilogo). */
export const deltaDaControllare = (delta: number | null) => delta !== null && Math.abs(delta) > 3;

export type RiepilogoDescrizione = { descrizione: string; classe: string; nRighe: number; avere: number; nuova: boolean };

export function riepilogoDescrizioni(fatture: Fattura[], note: Set<string>): RiepilogoDescrizione[] {
  const m = new Map<string, RiepilogoDescrizione>();
  for (const f of fatture) for (const r of f.righe) {
    const x = m.get(r.Descrizione) ?? { descrizione: r.Descrizione, classe: classifica(r.Descrizione), nRighe: 0, avere: 0, nuova: note.size > 0 && !note.has(r.Descrizione) };
    x.nRighe++;
    x.avere = Math.round((x.avere + r.AVERE) * 100) / 100;
    m.set(r.Descrizione, x);
  }
  return [...m.values()].sort((a, b) => b.avere - a.avere);
}

/** Ultimo numero registrato e prossimo da scaricare (per progressivo). */
export function ultimoNumero(numeri: string[]): { ultimo: string | null; prossimo: number | null } {
  let best: string | null = null, bp = -1;
  for (const n of numeri) { const p = progressivo(n); if (p !== null && p > bp) { bp = p; best = n; } }
  return { ultimo: best, prossimo: best ? bp + 1 : null };
}
