"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Option } from "@/domain/officine";

/**
 * Tendina multi-selezione con ricerca: ogni clic aggiunge o toglie un valore
 * (come la cella a tendina dell'Excel Ayvens). Mostra il numero di righe per valore.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const isSel = (v: string) => selected.some((s) => s.toLowerCase() === v.toLowerCase());
  const visible = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = n ? options.filter((o) => o.value.toLowerCase().includes(n)) : options;
    // le scelte fatte in cima
    return [...list.filter((o) => isSel(o.value)), ...list.filter((o) => !isSel(o.value))];
  }, [options, q, selected]);

  return (
    <div ref={box} className="relative">
      <div className="mb-1 flex items-center justify-between">
        <span id={`${id}-l`} className="text-xs font-semibold text-ink-muted">{label}</span>
        {selected.length > 0 && (
          <button type="button" onClick={onClear} className="text-xs font-semibold text-brand hover:underline">
            Togli
          </button>
        )}
      </div>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-l`}
        onClick={() => setOpen((o) => !o)}
        className="input flex min-h-11 w-full items-center justify-between gap-2 text-left text-[15px]"
      >
        <span className={`truncate ${selected.length ? "font-medium text-ink" : "text-ink-faint"}`}>
          {selected.length === 0 ? "Tutti" : selected.length === 1 ? selected[0] : `${selected[0]} +${selected.length - 1}`}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+4px)] z-30 min-w-[260px] rounded-card border border-line bg-surface-raised shadow-lift">
          <div className="border-b border-line p-2">
            <input
              ref={search}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
              placeholder={`Cerca ${label.toLowerCase()}…`}
              className="input h-9 text-sm"
            />
          </div>
          <ul role="listbox" aria-multiselectable="true" className="max-h-72 overflow-y-auto py-1">
            {visible.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">Nessun valore</li>}
            {visible.map((o) => {
              const on = isSel(o.value);
              return (
                <li key={o.value} role="option" aria-selected={on}>
                  <button
                    type="button"
                    onClick={() => onToggle(o.value)}
                    className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-[#f6f9fc] ${on ? "font-semibold text-brand" : "text-ink"}`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-brand bg-brand text-white" : "border-[#c4ccd6]"}`}
                    >
                      {on && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-3 w-3"><path d="m5 12 5 5 9-10" /></svg>}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{o.value}</span>
                    <span className="text-xs tabular-nums text-ink-muted">{o.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
