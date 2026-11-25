"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { etichettaMese } from "@/lib/mesi";
import type { DatiVista } from "./testi";
import { EVENTO_DATI, giornoLungo, quando } from "./testi";

const num = (x: number) => x.toLocaleString("it-IT");
const COLONNE_Q8 = ["PAN Carta", "Data", "Ora", "Identificativo", "Targa", "Prod.", "Volume", "Imp. Scontato", "Imp. Scontato no IVA", "Impianto", "Indirizzo", "Città", "Km"];

/** Tolleranze dell'incrocio in parole semplici (anche nella guida e nell'export). */
export function TolleranzeInParole({ t }: { t: DatiVista["tolleranze"] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5">
      <li><b>Ora</b>: il rifornimento visto da Targa deve stare entro {t.finestraMin} minuti dal pagamento Q8. Se Targa lo registra alla ripartenza, si accetta fino a {t.ritardoMaxMin} minuti dopo, ma solo per lo stesso furgone e gli stessi litri.</li>
      <li><b>Litri</b>: la differenza accettata è la più larga tra {t.litriAssoluti} litri e il {num(t.litriPercento * 100)} % dei litri pagati (il galleggiante del serbatoio non è preciso come la pompa).</li>
      <li><b>Luogo</b>: con le coordinate, il furgone deve stare entro {num(t.raggioKm)} km dal distributore; senza, si confrontano comune e via. Se il luogo non coincide, la coppia vale solo con al massimo {t.luogoDiversoMaxMin} minuti di differenza.</li>
      <li><b>Pochi litri</b>: sotto {t.sensoreMinLitri} litri il sensore può non accorgersene, quindi il pagamento risulta non verificabile.</li>
      <li><b>Furgone abituale</b> di una carta: quello abbinato almeno {t.abitualeMinVolte} volte e in almeno il {num(t.abitualeMinQuota * 100)} % dei suoi rifornimenti del mese.</li>
      <li><b>Serbatoio fermo</b>: il furgone abituale arriva, riparte o sosta al distributore entro {t.sostaMin} minuti dal pagamento (soste fino a {t.sostaMaxMin} minuti), ma il serbatoio non sale.</li>
    </ul>
  );
}

/**
 * Pannello "Come alimentare i dati": da dove arrivano i pagamenti Q8 e i rifornimenti Targa, cosa c'è già e cosa manca.
 * Si apre dal pulsante in intestazione (evento del browser) o dai link degli avvisi.
 */
export function PannelloDati({ dati }: { dati: DatiVista }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const apri = () => { if (ref.current && !ref.current.open) ref.current.showModal(); };
    window.addEventListener(EVENTO_DATI, apri);
    return () => window.removeEventListener(EVENTO_DATI, apri);
  }, []);
  const nomeMese = etichettaMese(dati.mese);
  const chiudi = () => ref.current?.close();

  return (
    <dialog ref={ref} aria-labelledby="pannello-dati-titolo" onClick={(e) => { if (e.target === ref.current) chiudi(); }}
      className="w-[min(760px,calc(100vw-24px))] max-w-none rounded-card border border-line bg-surface-raised p-0 text-ink shadow-lift backdrop:bg-black/40">
      <div className="flex max-h-[85vh] flex-col overflow-y-auto">
        <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 border-b border-line bg-surface-raised px-5 py-3">
          <h2 id="pannello-dati-titolo" className="text-lg font-semibold">Come alimentare i dati</h2>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-control text-ink-muted hover:bg-surface" aria-label="Chiudi" onClick={chiudi}>✕</button>
        </div>

        <div className="flex flex-col gap-5 px-5 py-4 text-sm leading-relaxed">
          <p className="text-ink-muted">L&apos;incrocio ha bisogno di due flussi: i <b className="text-ink">pagamenti delle carte Q8</b> (file che carichi tu) e i <b className="text-ink">rifornimenti visti dalla telematica Targa</b> (arrivano da soli).</p>

          <section className="flex flex-col gap-2">
            <h3 className="text-base font-semibold">1. Transazioni delle carte Q8</h3>
            <ol className="flex list-decimal flex-col gap-1 pl-5">
              <li>Entra nel portale <b>Q8 Flotte</b> → <b>Transazioni</b>, scegli il mese e premi <b>Esporta Excel</b>.</li>
              <li>Caricalo in <Link className="font-medium text-brand underline" href="/carburante-telepass/q8">Carburante e Telepass → Q8</Link> e conferma con <b>Salva</b>: il sito tiene ogni transazione, riga per riga. Ricaricare lo stesso file non crea doppioni.</li>
            </ol>
            <p className="text-ink-muted">Colonne usate: {COLONNE_Q8.join(", ")}.</p>
            {dati.q8Mesi.length === 0 ? (
              <p className="rounded-control bg-warn-soft px-3 py-2 text-warn">Nel sito non c&apos;è ancora nessuna transazione Q8 di DER2 o GLS.</p>
            ) : (
              <div className="overflow-x-auto rounded-control border border-line">
                <table className="w-full text-sm">
                  <thead><tr className="bg-surface text-left text-xs text-ink-muted"><th className="px-3 py-2">Mese</th><th className="px-3 py-2 text-right">Transazioni</th><th className="px-3 py-2">Ultimo giorno</th><th className="px-3 py-2">Caricato il</th></tr></thead>
                  <tbody>
                    {dati.q8Mesi.map((m) => (
                      <tr key={m.mese} className={`border-t border-line ${m.mese === dati.mese ? "bg-brand-light" : ""}`}>
                        <td className="whitespace-nowrap px-3 py-1.5 font-medium">{etichettaMese(m.mese)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{num(m.transazioni)}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{giornoLungo(m.ultimoGiorno)}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{quando(m.caricatoIl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-base font-semibold">2. Rifornimenti visti da Targa</h3>
            <p>Nessun file da caricare: il sito scarica ogni notte il giorno prima. Per i mesi vecchi o incompleti si completa da <Link className="font-medium text-brand underline" href={`/telematica/mese?mese=${dati.mese}`}>Furgoni → Il mese</Link> (scarica i giorni che mancano e il dettaglio dei rifornimenti, con ora e luogo).</p>
            <ul className="flex flex-col gap-2">
              {dati.copertura.map((c) => {
                const completo = c.targa.conOra >= c.targa.rifornimenti;
                return (
                  <li key={c.flotta} className="rounded-control border border-line px-3 py-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="badge-neutral">{c.flotta}</span>
                      <span aria-hidden>{completo ? "✅" : "⚠️"}</span>
                      {completo ? (
                        <span><b>{nomeMese}</b>: {num(c.targa.conOra)}/{num(c.targa.rifornimenti)} rifornimenti con ora e luogo</span>
                      ) : (
                        <span><b>{nomeMese}</b>: {num(c.targa.conOra)}/{num(c.targa.rifornimenti)} con ora e luogo – <Link className="font-medium text-brand underline" href={`/telematica/mese?mese=${dati.mese}`}>completa</Link></span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-ink-muted">
                      Giorni scaricati {num(c.targa.giorniScaricati)} su {num(c.targa.giorniDaScaricare)} · rifornimenti con coordinate {num(c.targa.conCoordinate)} · furgoni con telematica {num(c.mezziTelematica)} su {num(c.mezziFlotta)} · pagamenti Q8 {num(c.q8.transazioni)}{c.q8.ultimoGiorno ? ` (fino al ${giornoLungo(c.q8.ultimoGiorno)})` : ""}
                    </div>
                    {c.nota && <p className="mt-1 text-xs text-info">{c.nota}</p>}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-base font-semibold">Tolleranze in uso</h3>
            <TolleranzeInParole t={dati.tolleranze} />
            <p className="text-ink-muted">In questo mese il sito ha riconosciuto il furgone abituale di {num(dati.appreso.carteAbituali)} {dati.appreso.carteAbituali === 1 ? "carta" : "carte"} e il posto di {num(dati.appreso.distributoriLocalizzati)} {dati.appreso.distributoriLocalizzati === 1 ? "distributore" : "distributori"}, dai rifornimenti che tornano senza dubbi.</p>
          </section>
        </div>
      </div>
    </dialog>
  );
}
