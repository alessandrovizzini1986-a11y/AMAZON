"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Riquadro discreto alla prima visita di un modulo: 3 passi e la guida. Si chiude e non torna (per questo browser). */
export function PrimaVolta({ id, titolo, passi }: { id: string; titolo: string; passi: string[] }) {
  const chiave = `primavolta:${id}`;
  const [mostra, setMostra] = useState(false);
  useEffect(() => { try { setMostra(localStorage.getItem(chiave) !== "visto"); } catch { setMostra(false); } }, [chiave]);
  if (!mostra) return null;
  const chiudi = () => { setMostra(false); try { localStorage.setItem(chiave, "visto"); } catch { /* ok */ } };
  return (
    <aside aria-label="Prima volta qui?" className="mb-5 rounded-control border border-info/30 bg-info-soft px-4 py-3 text-sm text-ink print:hidden">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Prima volta in {titolo}?</p>
          <ol className="mt-1 list-decimal pl-5">{passi.map((p) => <li key={p}>{p}</li>)}</ol>
          <p className="mt-1 text-ink-muted">Ogni pulsante ha un <b>?</b> che spiega cosa fa e dove finisce il dato. <Link className="underline" href="/vademecum/16-come-funziona-il-sito">Come funziona il sito</Link></p>
        </div>
        <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={chiudi}>Ho capito</button>
      </div>
    </aside>
  );
}
