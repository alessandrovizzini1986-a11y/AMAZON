"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SPIEGAZIONI } from "@/content/spiegazioni";

/**
 * "i" accanto a un indicatore: spiega cosa vuol dire, come si calcola e come leggerlo.
 * Si apre passando sopra con il mouse, con il fuoco da tastiera o toccando; si chiude con Esc o toccando fuori.
 * È uno span (non un bottone) così può stare anche dentro un riquadro che è già un link.
 */
export function Spiega({ k, className = "" }: { k: string; className?: string }) {
  const v = SPIEGAZIONI[k];
  const [aperto, setAperto] = useState(false);
  const [aDestra, setADestra] = useState(false);
  const [fisso, setFisso] = useState<number | null>(null); // su schermi stretti: riquadro largo quanto lo schermo, sotto la "i"
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!aperto) return;
    const fuori = (e: Event) => { if (!box.current?.contains(e.target as Node)) setAperto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAperto(false); };
    document.addEventListener("pointerdown", fuori); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", fuori); document.removeEventListener("keydown", esc); };
  }, [aperto]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!v) return null;
  const apri = () => {
    const r = box.current?.getBoundingClientRect();
    if (r) { setADestra(r.left + 320 > window.innerWidth - 8); setFisso(window.innerWidth < 520 ? r.bottom + 8 : null); }
    setAperto(true);
  };
  const dopo = (f: () => void, ms: number) => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(f, ms); };
  return (
    <span ref={box} className={`relative ml-1.5 inline-flex align-middle ${className}`}
      onMouseEnter={() => dopo(apri, 150)} onMouseLeave={() => dopo(() => setAperto(false), 200)}>
      <span role="button" tabIndex={0} aria-expanded={aperto} aria-controls={id} aria-label="Cosa vuol dire questo numero?"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (aperto) setAperto(false); else apri(); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); if (aperto) setAperto(false); else apri(); } }}
        onFocus={apri} onBlur={() => dopo(() => setAperto(false), 150)}
        className="inline-flex h-[18px] w-[18px] cursor-help select-none items-center justify-center rounded-full border border-[#c4ccd6] bg-surface-raised font-serif text-[11px] font-bold italic leading-none text-ink-muted hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand [@media(pointer:coarse)]:h-7 [@media(pointer:coarse)]:w-7 [@media(pointer:coarse)]:text-sm">i</span>
      {aperto && (
        <span id={id} role="tooltip" style={fisso === null ? undefined : { position: "fixed", top: fisso, left: 12, right: 12, width: "auto", marginTop: 0 }}
          className={`absolute top-full z-40 mt-2 block w-[min(320px,86vw)] rounded-control border border-line bg-surface-raised p-3 text-left text-sm font-normal normal-case leading-snug tracking-normal text-ink shadow-lg ${aDestra ? "right-0" : "left-0"}`}>
          <span className="block">{v.cosa}</span>
          <span className="mt-1.5 block"><b>Come si calcola:</b> {v.come}</span>
          {v.leggi && <span className="mt-1.5 block"><b>Come leggerlo:</b> {v.leggi}</span>}
        </span>
      )}
    </span>
  );
}
