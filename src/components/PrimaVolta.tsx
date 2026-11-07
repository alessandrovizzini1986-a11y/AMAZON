"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Riga compatta alla prima visita di un modulo: si apre per leggere i passi; "Ho capito" la nasconde per sempre (per questo browser). */
export function PrimaVolta({ id, titolo, passi }: { id: string; titolo: string; passi: string[] }) {
  const chiave = `primavolta:${id}`;
  const [mostra, setMostra] = useState(false);
  useEffect(() => { try { setMostra(localStorage.getItem(chiave) !== "visto"); } catch { setMostra(false); } }, [chiave]);
  if (!mostra) return null;
  const chiudi = () => { setMostra(false); try { localStorage.setItem(chiave, "visto"); } catch { /* ok */ } };
  return (
    <details aria-label="Prima volta qui?" className="mb-3 rounded-control border border-info/30 bg-info-soft px-4 py-2 text-sm text-ink print:hidden">
      <summary className="flex min-h-[32px] cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">Prima volta in {titolo}?</span>
        <span className="text-brand underline">leggi i {passi.length} passi</span>
        <button type="button" className="ml-auto btn-secondary px-3 py-1 text-xs" onClick={(e) => { e.preventDefault(); chiudi(); }}>Ho capito, non mostrare più</button>
      </summary>
      <ol className="mt-2 list-decimal pl-5">{passi.map((p) => <li key={p}>{p}</li>)}</ol>
      <p className="mt-1 pb-1 text-ink-muted">Ogni pulsante ha un <b>?</b> che spiega cosa fa e dove finisce il dato. <Link className="underline" href="/vademecum/16-come-funziona-il-sito">Come funziona il sito</Link></p>
    </details>
  );
}
