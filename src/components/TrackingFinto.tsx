"use client";

import { useState } from "react";
import { GIORNI_DEMO, RIGHE_LAVORO, RIGHE_TRACKING, totaliDemo, type Cella, type RigaTracking, type TrackingDemo } from "@/domain/corsi/corsi";

/** Cosa vuol dire ogni riga, in una frase (si legge passando sopra o toccando il nome della riga). */
export const SPIEGA_RIGA: Record<RigaTracking | "Amazon", string> = {
  Standard: "Ore normali, quelle del contratto. Ha lavorato.",
  Straordinario: "Ore oltre il tetto dell'Accordo (42). Ha lavorato.",
  Supplementare: "Ore in più di un part time, fino a 39. Ha lavorato.",
  Accordo: "Ore da 39 a 42 della settimana: lavorate ma assorbite, perché il driver prende la diaria. Non sono pagate come straordinario.",
  Totali: "Somma delle quattro righe del lavoro. La calcola il file.",
  RIPOSO: "Giorno di riposo. Qui l'OS scrive anche le sigle: MEZZI, UFF, CORSO, altra station.",
  FERIE: "Ferie. Non ha lavorato.", ROL: "Permesso retribuito (riduzione orario). Non ha lavorato.", ExF: "Ex festività. Non ha lavorato.",
  L104: "Permesso legge 104. Non ha lavorato.", AssIng: "Assenza ingiustificata: non pagata.", PermSind: "Permesso sindacale.",
  AltriPerm: "Altri permessi (104, congedo parentale).", PermNR: "Permesso non retribuito: non pagato.",
  MALATTIA: "Malattia. Non ha lavorato.", INFORTUNIO: "Infortunio. Non ha lavorato.",
  Trasferta: "1 nei giorni in cui spetta la trasferta (più di 4 ore lavorate).",
  Amazon: "Non è una riga del tracking: sono i pacchi consegnati secondo Amazon (dai CSV). In rotta se più di 10.",
};

const fmt = (v: Cella) => (v === null || v === undefined || v === "" ? "" : typeof v === "number" ? String(v).replace(".", ",") : v);
/** Nomi corti per il telefono. */
const CORTA: Partial<Record<RigaTracking, string>> = { Straordinario: "Straord.", Supplementare: "Supplem.", Accordo: "Accordo", Trasferta: "Trasferta", AssIng: "Ass. ingiust.", PermSind: "Perm. sind.", AltriPerm: "Altri perm.", PermNR: "Perm. non retr." };
const SEMPRE: RigaTracking[] = ["Standard", "Straordinario", "Supplementare", "Accordo", "Totali", "RIPOSO", "Trasferta"];

/**
 * Un driver disegnato come nel tracking Excel: stesse righe, stesso ordine. Con `onCella` le celle si cliccano
 * (esercizio "trova la cella sbagliata"); `scelta` = cella scelta; `esito` colora la scelta dopo la correzione.
 */
export function TrackingFinto({ t, onCella, scelta, esito, bloccato }: { t: TrackingDemo; onCella?: (id: string) => void; scelta?: string | null; esito?: "ok" | "ko" | null; bloccato?: boolean }) {
  const [riga, setRiga] = useState<RigaTracking | "Amazon" | null>(null);
  const tot = totaliDemo(t);
  const righe = RIGHE_TRACKING.filter(([k]) => t.tutte || SEMPRE.includes(k) || (k !== "Totali" && t.righe[k]));
  const giorni = t.giorni ?? GIORNI_DEMO;
  const valore = (k: RigaTracking, i: number): Cella => (k === "Totali" ? tot[i] || (t.tutte ? 0 : "") : t.righe[k]?.[i] ?? null);
  const cella = (k: RigaTracking | "Amazon", i: number, v: Cella, cls: string) => {
    const id = `${k}|${i}`, sel = scelta === id;
    const colore = sel ? (esito === "ok" ? "bg-ok-soft ring-2 ring-inset ring-ok" : esito === "ko" ? "bg-danger-soft ring-2 ring-inset ring-danger" : "bg-brand-light ring-2 ring-inset ring-brand") : "";
    return (
      <td key={i} className={`border border-[#d5dbe3] p-0 text-center ${cls} ${colore}`}>
        {onCella && k !== "Totali"
          ? <button type="button" disabled={bloccato} aria-pressed={sel} aria-label={`${k === "Amazon" ? "Amazon" : RIGHE_TRACKING.find((x) => x[0] === k)![1]}, ${giorni[i]}: ${fmt(v) || "vuota"}`} onClick={() => onCella(id)} className="block h-9 w-full min-w-[34px] px-0.5 font-mono text-[13px] hover:bg-brand-light sm:min-w-[44px] sm:px-1 disabled:hover:bg-transparent">{fmt(v)}</button>
          : <span className="block h-9 min-w-[34px] px-0.5 font-mono text-[13px] leading-9 sm:min-w-[44px] sm:px-1">{fmt(v)}</span>}
      </td>
    );
  };
  return (
    <figure className="flex flex-col gap-1">
      {t.titolo && <figcaption className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t.titolo}</figcaption>}
      {/* sul telefono le prime due colonne non ci stanno: contratto e nome vanno sopra la tabella */}
      <p className="text-sm sm:hidden"><b>{t.nome}</b> · {t.contratto}</p>
      <div className="overflow-x-auto rounded-control border border-[#b9c2ce]">
        <table className="w-full border-collapse bg-white text-[13px] text-[#10213a]">
          <thead>
            <tr className="bg-[#1f3a5f] text-white">
              <th className="hidden border border-[#2c4b76] px-2 py-1.5 text-left font-semibold sm:table-cell">Tipo Contratto</th>
              <th className="hidden border border-[#2c4b76] px-2 py-1.5 text-left font-semibold sm:table-cell">Lavoratore</th>
              <th className="border border-[#2c4b76] px-2 py-1.5 text-left font-semibold">Tipo</th>
              {giorni.map((g, i) => <th key={i} className={`border border-[#2c4b76] px-1 py-1.5 text-center font-semibold ${i === 6 ? "bg-[#7a2e2e]" : ""}`}>{g}</th>)}
            </tr>
          </thead>
          <tbody>
            {righe.map(([k, etichetta], n) => {
              const lavoro = RIGHE_LAVORO.includes(k), stile = k === "Totali" ? "bg-[#e9edf3] font-bold" : k === "Trasferta" ? "bg-[#eaf5ec]" : lavoro ? "" : "bg-[#fafbfc] text-[#44505f]";
              return (
                <tr key={k} className={stile}>
                  <td className="hidden whitespace-nowrap border border-[#d5dbe3] px-2 text-[#44505f] sm:table-cell">{n === 0 ? t.contratto : ""}</td>
                  <td className="hidden whitespace-nowrap border border-[#d5dbe3] px-2 sm:table-cell">{n === 0 ? t.nome : ""}</td>
                  <td className="whitespace-nowrap border border-[#d5dbe3] p-0"><button type="button" onClick={() => setRiga(riga === k ? null : k)} onMouseEnter={() => setRiga(k)} className={`block h-9 w-full px-1.5 text-left sm:px-2 ${lavoro || k === "Totali" ? "font-semibold" : ""} hover:underline`} aria-expanded={riga === k}><span className="sm:hidden">{CORTA[k] ?? etichetta}</span><span className="hidden sm:inline">{etichetta}</span></button></td>
                  {giorni.map((_, i) => cella(k, i, valore(k, i), ""))}
                </tr>
              );
            })}
            {t.amazon && (
              <tr className="bg-[#fff6e5]">
                <td colSpan={2} className="hidden border border-[#d5dbe3] px-2 text-right text-xs text-[#7a5a00] sm:table-cell">dai CSV di Amazon →</td>
                <td className="whitespace-nowrap border border-[#d5dbe3] p-0"><button type="button" onClick={() => setRiga(riga === "Amazon" ? null : "Amazon")} onMouseEnter={() => setRiga("Amazon")} className="block h-9 w-full px-2 text-left font-semibold text-[#7a5a00] hover:underline"><span className="sm:hidden">Pacchi Amazon</span><span className="hidden sm:inline">Pacchi consegnati</span></button></td>
                {giorni.map((_, i) => cella("Amazon", i, t.amazon![i] ?? null, "text-[#7a5a00]"))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="min-h-[20px] text-xs text-ink-muted" aria-live="polite">{riga ? <><b>{riga === "Amazon" ? "Pacchi consegnati" : RIGHE_TRACKING.find((x) => x[0] === riga)![1]}:</b> {SPIEGA_RIGA[riga]}</> : "Passa sopra il nome di una riga (o toccalo) per sapere cosa vuol dire."}</p>
    </figure>
  );
}
