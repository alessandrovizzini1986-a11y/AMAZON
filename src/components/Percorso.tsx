"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Percorso as P } from "@/domain/percorsi/percorso";

const ICONA = { fatto: "✓", ora: "→", dopo: "·", facoltativo: "○" } as const;

/**
 * Fascia sottile con il percorso del modulo: una riga con il prossimo passo e "Vai";
 * "Mostra i passi" apre l'elenco. Lo stato aperto/chiuso resta per questo browser.
 */
export function Percorso({ p }: { p: P }) {
  const chiave = `percorso:${p.id}`;
  const [aperto, setAperto] = useState(false);
  useEffect(() => { try { setAperto(localStorage.getItem(chiave) === "1"); } catch { /* storage non disponibile */ } }, [chiave]);
  const cambia = () => { const v = !aperto; setAperto(v); try { localStorage.setItem(chiave, v ? "1" : "0"); } catch { /* ok */ } };
  const ora = p.passi.find((x) => x.stato === "ora");
  const n = p.passi.findIndex((x) => x.stato === "ora") + 1;
  const obbligatori = p.passi.filter((x) => x.stato !== "facoltativo").length;
  return (
    <section aria-label={`Percorso: ${p.titolo}`} className={`mb-3 rounded-control border px-4 py-2 text-sm print:hidden ${ora ? "border-brand/30 bg-brand-light" : "border-ok/30 bg-ok-soft"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">{p.titolo}</span>
        {ora ? (
          <>
            <span className="text-ink-muted">Passo {n} di {obbligatori}:</span>
            <span>{ora.titolo}{ora.nota && <span className="text-ink-muted"> ({ora.nota})</span>}</span>
            {ora.href && <Link href={ora.href} className="btn-primary px-3 py-1.5 text-xs">Vai</Link>}
          </>
        ) : <span className="text-ok">✓ tutto fatto</span>}
        <button type="button" onClick={cambia} aria-expanded={aperto} className="ml-auto text-xs font-semibold text-brand underline">{aperto ? "Nascondi i passi" : "Mostra i passi"}</button>
      </div>
      {aperto && (
        <ol className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
          {p.passi.map((x, i) => (
            <li key={x.id} className={`flex flex-wrap items-baseline gap-2 ${x.stato === "dopo" ? "text-ink-muted" : ""}`}>
              <span aria-hidden className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${x.stato === "fatto" ? "bg-ok text-white" : x.stato === "ora" ? "bg-brand text-white" : "border border-line"}`}>{ICONA[x.stato]}</span>
              <span className="sr-only">{x.stato === "fatto" ? "fatto" : x.stato === "ora" ? "da fare ora" : x.stato === "facoltativo" ? "facoltativo" : "da fare dopo"}:</span>
              <span>{i + 1}. {x.href ? <Link className="underline" href={x.href}>{x.titolo}</Link> : x.titolo}</span>
              {x.nota && <span className="text-xs text-ink-muted">{x.nota}</span>}
              {x.stato === "facoltativo" && <span className="text-xs text-ink-muted">(facoltativo)</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Avviso prima di lasciare la pagina quando c'è un risultato temporaneo non salvato. */
export function useAvvisoUscita(attivo: boolean) {
  useEffect(() => {
    if (!attivo) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [attivo]);
}
