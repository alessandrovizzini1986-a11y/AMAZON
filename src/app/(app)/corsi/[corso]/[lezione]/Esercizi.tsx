"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { numero, type Esito, type EsercizioVista, type Risposta } from "@/domain/corsi/corsi";
import { consegna } from "../../actions";

/**
 * Esercizi di una lezione: tutti obbligatori, corretti insieme. Se ne sbagli uno vedi la spiegazione e riprovi
 * (gli esercizi con i numeri cambiano). `conta` = la lezione è ancora da superare.
 */
export function Esercizi({ corso, slug, esercizi, variante, conta, dopo, tentativi }: {
  corso: string; slug: string; esercizi: EsercizioVista[]; variante: number; conta: boolean; dopo: { href: string; titolo: string } | null; tentativi: number;
}) {
  const router = useRouter(), path = usePathname();
  const [scelte, setScelte] = useState<Record<string, number>>({});
  const [numeri, setNumeri] = useState<Record<string, string[]>>({});
  const [esiti, setEsiti] = useState<Esito[] | null>(null);
  const [superata, setSuperata] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");

  const completo = esercizi.every((e) => (e.tipo === "scelta" ? scelte[e.id] !== undefined : e.campi.every((_, i) => numero(numeri[e.id]?.[i] ?? "") !== null)));
  const invia = async () => {
    setBusy(true); setErrore("");
    try {
      const risposte: Record<string, Risposta> = {};
      for (const e of esercizi) risposte[e.id] = e.tipo === "scelta" ? scelte[e.id] ?? null : e.campi.map((_, i) => numero(numeri[e.id]?.[i] ?? ""));
      const r = await consegna({ corso, slug, risposte, variante });
      setEsiti(r.esiti); setSuperata(r.superata);
    } catch (x) { setErrore(x instanceof Error ? x.message : "Non sono riuscito a correggere: riprova."); }
    finally { setBusy(false); }
  };
  // nuovo tentativo: la lezione da superare prende la variante dai tentativi salvati; in ripasso si passa alla variante dopo
  const riprova = () => { if (conta) router.refresh(); else router.replace(`${path}?${new URLSearchParams({ ...(new URLSearchParams(window.location.search).get("ripasso") ? { ripasso: "1" } : {}), v: String(variante + 1) })}`); };
  const esito = (id: string) => esiti?.find((x) => x.id === id) ?? null;
  const giuste = esiti?.filter((x) => x.ok).length ?? 0;

  return (
    <section className="card flex flex-col gap-5 p-4 md:p-6" aria-label="Esercizi">
      <div>
        <h2 className="text-[19px] font-semibold">Esercizi</h2>
        <p className="text-sm text-ink-muted">{conta ? "Per passare alla lezione dopo servono tutte le risposte giuste nello stesso invio. Puoi riprovare quante volte vuoi." : "Qui ti alleni: l'avanzamento non cambia."}{conta && tentativi > 0 ? ` Tentativi fatti: ${tentativi}.` : ""}</p>
      </div>
      <ol className="flex flex-col gap-5">
        {esercizi.map((e, n) => {
          const r = esito(e.id);
          return (
            <li key={e.id} className={`rounded-control border p-4 ${r ? (r.ok ? "border-ok bg-ok-soft" : "border-danger bg-danger-soft") : "border-line"}`}>
              <p className="font-medium"><span className="mr-2 text-ink-muted">{n + 1}.</span>{e.domanda}</p>
              {e.tipo === "scelta" ? (
                <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label={`Risposta all'esercizio ${n + 1}`}>
                  {e.opzioni.map((o, i) => (
                    <label key={i} className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-control border bg-surface-raised px-3 py-2 ${scelte[e.id] === i ? "border-brand ring-1 ring-brand" : "border-[#d5dbe3]"}`}>
                      <input type="radio" name={`${e.id}-${variante}`} className="h-4 w-4" checked={scelte[e.id] === i} disabled={!!esiti} onChange={() => setScelte({ ...scelte, [e.id]: i })} />
                      <span>{o}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-3">
                  {e.campi.map((c, i) => (
                    <label key={c} className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">{c}
                      <input className="input h-11 w-32 font-mono text-base" inputMode="decimal" placeholder="0" disabled={!!esiti} value={numeri[e.id]?.[i] ?? ""}
                        onChange={(ev) => { const a = [...(numeri[e.id] ?? e.campi.map(() => ""))]; a[i] = ev.target.value; setNumeri({ ...numeri, [e.id]: a }); }} />
                    </label>
                  ))}
                </div>
              )}
              {r && <p className={`mt-3 text-sm ${r.ok ? "text-ok" : "text-danger"}`} role="status"><b>{r.ok ? "Giusto." : "Non è giusto."}</b> {r.ok ? "" : r.perche}</p>}
            </li>
          );
        })}
      </ol>

      {errore && <p className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{errore}</p>}
      {!esiti && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary h-11" disabled={!completo || busy} onClick={invia}>{busy ? "Correggo…" : "Correggi"}</button>
          {!completo && <span className="text-sm text-ink-muted">Rispondi a tutti gli esercizi per poterli correggere.</span>}
        </div>
      )}
      {esiti && superata && (
        <div className="flex flex-wrap items-center gap-3 rounded-control bg-ok-soft px-4 py-3">
          <p className="mr-auto font-semibold text-ok">{conta ? "Lezione superata." : "Tutto giusto."}{conta && !dopo ? " Hai completato il corso." : ""}</p>
          {dopo ? <Link href={dopo.href} className="btn-primary">Vai avanti: {dopo.titolo}</Link> : <Link href="/corsi" className="btn-primary">Torna ai corsi</Link>}
        </div>
      )}
      {esiti && !superata && (
        <div className="flex flex-wrap items-center gap-3 rounded-control bg-warn-soft px-4 py-3">
          <p className="mr-auto text-sm text-warn"><b>{giuste} giuste su {esercizi.length}.</b> Leggi le spiegazioni in rosso, rileggi la regola qui sopra e riprova: gli esercizi con i numeri cambiano.</p>
          <button type="button" className="btn-primary" onClick={riprova}>Riprova</button>
        </div>
      )}
    </section>
  );
}
