"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AIUTO, DOVE, type Dove } from "@/content/aiuto";
import { ConSigle } from "./Sigle";

const TONO: Record<string, string> = { ok: "badge-ok", info: "badge-info", warn: "badge-warn", neutral: "badge-neutral" };

/** Etichetta fissa "dove finisce il dato" (Salvato sul sito / Solo su questo PC / Temporaneo / Scarichi un file). */
export function DoveFinisce({ tipo, className = "" }: { tipo: Dove; className?: string }) {
  const d = DOVE[tipo];
  return <span className={`${TONO[d.tono]} ${className}`} title={d.spiega}><span className="badge-dot" aria-hidden />{d.etichetta}</span>;
}

/**
 * Pulsante "?" con la spiegazione di un'azione: cosa fa, cosa fare prima, dove finisce il dato.
 * Si apre al tocco o al clic (non solo al passaggio del mouse), si chiude con Esc o toccando fuori.
 */
export function Aiuto({ k, className = "" }: { k: string; className?: string }) {
  const v = AIUTO[k];
  const [aperto, setAperto] = useState(false);
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!aperto) return;
    const fuori = (e: Event) => { if (!box.current?.contains(e.target as Node)) setAperto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAperto(false); };
    document.addEventListener("pointerdown", fuori); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", fuori); document.removeEventListener("keydown", esc); };
  }, [aperto]);
  if (!v) return null;
  const d = DOVE[v.dove];
  return (
    <span ref={box} className={`relative inline-flex align-middle ${className}`}>
      <button type="button" aria-expanded={aperto} aria-controls={id} aria-label="Cosa fa questo pulsante?" onClick={() => setAperto(!aperto)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#c4ccd6] bg-surface-raised text-xs font-bold text-ink-muted hover:border-brand hover:text-brand [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">?</button>
      {aperto && (
        <span id={id} role="dialog" aria-label="Aiuto"
          className="absolute left-1/2 top-full z-40 mt-2 w-[min(320px,85vw)] -translate-x-1/2 rounded-control border border-line bg-surface-raised p-3 text-left text-sm font-normal normal-case leading-snug tracking-normal text-ink shadow-lg">
          <span className="block"><b>Cosa fa:</b> <ConSigle testo={v.fa} /></span>
          <span className="mt-1.5 block"><b>Prima di premere:</b> <ConSigle testo={v.prima} /></span>
          <span className="mt-1.5 block"><b>Dove finisce:</b> <DoveFinisce tipo={v.dove} className="ml-1" /><span className="mt-1 block text-ink-muted">{d.spiega}</span></span>
          {v.nota && <span className="mt-1.5 block text-ink-muted">{v.nota}</span>}
        </span>
      )}
    </span>
  );
}

/** Pulsante spento con il motivo scritto sotto (e link al passo che manca). */
export function Motivo({ testo, href }: { testo: string | null; href?: string }) {
  if (!testo) return null;
  return <p className="mt-1 text-xs text-warn">{testo}{href && <> · <a className="underline" href={href}>vai</a></>}</p>;
}
