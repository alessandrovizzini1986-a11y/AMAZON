"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { NavIcon } from "./icons";
import { cercaPagine, type Pagina } from "./navModel";

/**
 * Casella di ricerca delle pagine con l'elenco dei risultati: frecce per scegliere, Invio per aprire.
 * `onScrivi` avvisa chi la contiene (il pannello del telefono nasconde il menu mentre si cerca); `onVai` chiude il pannello quando si apre una pagina.
 */
export function RicercaPagine({ pagine, autoFocus = false, onScrivi, onVai }: { pagine: Pagina[]; autoFocus?: boolean; onScrivi?: (q: string) => void; onVai?: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const router = useRouter();
  const id = useId();
  const risultati = cercaPagine(q, pagine);
  const scrivi = (v: string) => { setQ(v); setSel(0); onScrivi?.(v); };
  const tasto = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, risultati.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter" && risultati[sel]) { e.preventDefault(); router.push(risultati[sel].href); onVai?.(); }
  };
  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Cerca una pagina</span>
        <NavIcon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input type="text" inputMode="search" enterKeyHint="go" value={q} onChange={(e) => scrivi(e.target.value)} onKeyDown={tasto} autoFocus={autoFocus} autoComplete="off"
          placeholder="Cerca una pagina: telepass, fatture, mezzi…" role="combobox" aria-expanded={risultati.length > 0} aria-controls={id}
          aria-activedescendant={risultati[sel] ? `${id}-${sel}` : undefined}
          className="min-h-[44px] w-full rounded-control border border-line bg-surface-raised pl-9 pr-3 text-[15px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none" />
      </label>
      {q.trim() && (
        <ul id={id} role="listbox" aria-label="Pagine trovate" className="mt-2 flex flex-col gap-0.5">
          {risultati.map((p, i) => (
            <li key={p.href} id={`${id}-${i}`} role="option" aria-selected={i === sel}>
              <Link href={p.href} onMouseEnter={() => setSel(i)} onClick={() => onVai?.()}
                className={`flex min-h-[44px] items-start gap-3 rounded-control px-3 py-2 text-sm ${i === sel ? "bg-brand-light text-brand" : "text-ink hover:bg-surface"}`}>
                <NavIcon name={p.icon} className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="flex flex-col">
                  <span className="font-medium">{p.label}</span>
                  <span className="text-xs text-ink-muted">{p.gruppo}{p.descr ? ` · ${p.descr}` : ""}</span>
                </span>
              </Link>
            </li>
          ))}
          {!risultati.length && <li className="px-3 py-2 text-sm text-ink-muted">Nessuna pagina con queste parole.</li>}
        </ul>
      )}
    </div>
  );
}

/** Pulsante "Cerca" nella barra in alto (computer e tablet): apre la ricerca, anche con Ctrl+K o ⌘K. */
export function CercaPagine({ pagine }: { pagine: Pagina[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [aperto, setAperto] = useState(false);
  const pathname = usePathname();
  const apri = () => { ref.current?.showModal(); setAperto(true); };
  useEffect(() => { ref.current?.close(); }, [pathname]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (ref.current?.open) ref.current.close(); else apri(); } };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, []);
  return (
    <>
      <button type="button" onClick={apri} aria-haspopup="dialog" title="Cerca una pagina (Ctrl+K)" aria-label="Cerca una pagina"
        className="hidden h-9 items-center gap-2 rounded-control border border-line px-2.5 text-sm text-ink-muted transition-colors hover:border-brand hover:text-ink md:flex">
        <NavIcon name="search" className="h-4 w-4" />
        <kbd className="hidden font-sans text-xs text-ink-faint 2xl:inline">Ctrl K</kbd>
      </button>
      <dialog ref={ref} aria-label="Cerca una pagina" onClose={() => setAperto(false)} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
        className="mx-auto mt-[12vh] w-[min(560px,calc(100vw-32px))] rounded-2xl bg-surface-raised p-3 shadow-xl backdrop:bg-black/40">
        {/* rimontata a ogni apertura: la casella riparte vuota */}
        {aperto && <RicercaPagine pagine={pagine} autoFocus onVai={() => ref.current?.close()} />}
      </dialog>
    </>
  );
}
