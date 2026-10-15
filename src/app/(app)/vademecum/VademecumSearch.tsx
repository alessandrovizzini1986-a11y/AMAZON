"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import MiniSearch from "minisearch";
import { MINISEARCH_OPTIONS, snippet } from "@/domain/vademecumSearch";

type Block = { id: string; href: string; page: string; section: string; text: string };
type Hit = Block & { terms: string[] };

const MAX_RESULTS = 10;

/**
 * Ricerca full-text nel browser: l'indice (blocchi per sezione) si scarica al
 * primo utilizzo. "/" porta nel campo, Esc chiude i risultati.
 */
export function VademecumSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<MiniSearch<Block> | null>(null);
  const [error, setError] = useState(false);
  const loading = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (index || loading.current) return;
    loading.current = true;
    try {
      const res = await fetch("/api/vademecum/search-index");
      if (!res.ok) throw new Error(String(res.status));
      const ms = new MiniSearch<Block>(MINISEARCH_OPTIONS);
      ms.addAll((await res.json()) as Block[]);
      setIndex(ms);
    } catch {
      setError(true);
    } finally {
      loading.current = false;
    }
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hits: Hit[] = useMemo(() => {
    if (!index || query.trim().length < 2) return [];
    return index.search(query).slice(0, MAX_RESULTS).map((r) => ({ ...(r as unknown as Block), id: String(r.id), terms: r.terms }));
  }, [index, query]);

  const close = () => {
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className="relative print:hidden">
      <label className="sr-only" htmlFor="vademecum-search">Cerca nel vademecum</label>
      <div className="relative z-30">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          id="vademecum-search"
          ref={input}
          type="search"
          autoComplete="off"
          placeholder="Cerca procedure, codici, template… (premi /)"
          className="input h-12 pl-11 pr-12 text-[16px]"
          value={query}
          onFocus={() => { load(); setOpen(true); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); if (query) setQuery(""); else close(); } }}
          aria-expanded={open && query.trim().length >= 2}
          aria-controls="vademecum-search-results"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-surface px-1.5 font-mono text-xs text-ink-muted sm:block">/</kbd>
      </div>

      {open && query.trim().length >= 2 && (
        <div
          id="vademecum-search-results"
          className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-[70vh] overflow-y-auto rounded-card border border-line bg-surface-raised shadow-lift"
        >
          {error ? (
            <p className="p-4 text-sm text-danger">Indice di ricerca non disponibile. Ricarica la pagina.</p>
          ) : !index ? (
            <p className="p-4 text-sm text-ink-muted">Caricamento…</p>
          ) : hits.length === 0 ? (
            <p className="p-4 text-sm text-ink-muted">Nessun risultato per “{query}”.</p>
          ) : (
            <ul>
              {hits.map((h) => (
                <li key={h.id} className="border-b border-[#eef1f4] last:border-b-0">
                  <Link href={h.href} onClick={close} className="block px-4 py-3 transition-colors hover:bg-[#f6f9fc]">
                    <div className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">{h.page}</div>
                    <div className="mt-0.5 font-semibold text-brand">{h.section}</div>
                    <p className="mt-1 text-sm leading-relaxed text-[#3c4a5c]">
                      {snippet(h.text || h.section, h.terms).map((p, i) =>
                        p.mark ? <mark key={i} className="rounded-sm bg-[#fdf1dc] px-0.5 text-ink">{p.text}</mark> : <span key={i}>{p.text}</span>,
                      )}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {open && <button type="button" aria-label="Chiudi risultati" className="fixed inset-0 z-20 cursor-default" tabIndex={-1} onClick={close} />}
    </div>
  );
}
