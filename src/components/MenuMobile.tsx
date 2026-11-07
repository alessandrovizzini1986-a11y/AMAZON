"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/login/actions";
import { NavIcon } from "./icons";
import { gruppoAttivo, voceAttiva, type NavGroup } from "./navModel";

/**
 * Voce "Menu" della barra in basso (telefono): apre un pannello dal basso con tutte le voci divise per gruppo,
 * l'account e l'uscita. Dialog nativo: Esc chiude, il focus torna al pulsante.
 */
export function MenuMobile({ gruppi, attivo, utente }: { gruppi: NavGroup[]; attivo: boolean; utente: { nome: string; ruolo: string } }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const corrente = voceAttiva(pathname, gruppi.flatMap((g) => g.items));
  useEffect(() => { ref.current?.close(); }, [pathname]);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} aria-haspopup="dialog" aria-current={attivo ? "page" : undefined}
        className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors ${attivo ? "text-brand" : "text-ink-faint"}`}>
        <NavIcon name="menu" className="h-5 w-5" />
        Menu
      </button>
      <dialog ref={ref} aria-label="Menu" onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
        className="m-0 mt-auto w-full max-w-none rounded-t-2xl bg-surface-raised p-0 shadow-xl backdrop:bg-black/40">
        <div className="flex max-h-[85vh] flex-col overflow-y-auto px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm text-ink-muted">{utente.nome} · {utente.ruolo}</span>
            <button type="button" className="flex h-11 w-11 items-center justify-center rounded-control text-ink-muted" aria-label="Chiudi il menu" onClick={() => ref.current?.close()}>✕</button>
          </div>
          <nav aria-label="Tutte le sezioni" className="flex flex-col gap-3">
            {gruppi.map((g) => (
              <div key={g.id}>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">{g.label}</div>
                <div className="grid grid-cols-2 gap-2">
                  {g.items.map((v) => {
                    const on = corrente?.href === v.href;
                    return (
                      <Link key={v.href} href={v.href} aria-current={on ? "page" : undefined}
                        className={`flex min-h-[48px] items-center gap-2.5 rounded-control border px-3 text-[15px] font-medium ${on ? "border-brand bg-brand-light text-brand" : "border-line text-ink"}`}>
                        <NavIcon name={v.icon} className="h-5 w-5 shrink-0" />{v.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
            <Link href="/account" className="flex min-h-[48px] items-center gap-3 rounded-control px-3 text-[15px] text-ink"><NavIcon name="user" className="h-5 w-5" />Account</Link>
            <form action={logoutAction}><button className="flex min-h-[48px] w-full items-center gap-3 rounded-control px-3 text-[15px] text-ink"><NavIcon name="logout" className="h-5 w-5" />Esci</button></form>
          </div>
        </div>
      </dialog>
    </>
  );
}

/**
 * Barra in alto: un gruppo con più voci è una tendina (voce + descrizione breve); con una sola voce è un link.
 * Con più gruppi insieme ("Altro" sul tablet) le voci sono divise per gruppo.
 */
export function GruppoMenu({ gruppi, etichetta, tutti, allineaDestra = false }: { gruppi: NavGroup[]; etichetta: string; tutti: NavGroup[]; allineaDestra?: boolean }) {
  const pathname = usePathname();
  const [aperto, setAperto] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { setAperto(false); }, [pathname]);
  useEffect(() => {
    if (!aperto) return;
    const fuori = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setAperto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAperto(false); };
    document.addEventListener("mousedown", fuori); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuori); document.removeEventListener("keydown", esc); };
  }, [aperto]);
  const attivo = gruppoAttivo(pathname, tutti);
  const on = !!attivo && gruppi.some((g) => g.id === attivo.id);
  const corrente = voceAttiva(pathname, tutti.flatMap((g) => g.items));
  const stile = `whitespace-nowrap rounded-control px-2.5 py-2.5 text-[15px] transition-colors ${on ? "bg-brand-light font-semibold text-brand" : "font-medium text-[#3c4a5c] hover:bg-surface hover:text-ink"}`;
  if (gruppi.length === 1 && gruppi[0].items.length === 1) {
    const v = gruppi[0].items[0];
    return <Link href={v.href} aria-current={on ? "page" : undefined} className={stile}>{etichetta}</Link>;
  }
  return (
    <div ref={box} className="relative">
      <button type="button" aria-expanded={aperto} aria-haspopup="menu" onClick={() => setAperto(!aperto)} className={stile}>
        {etichetta} <span aria-hidden className="text-xs">▾</span>
      </button>
      {aperto && (
        <div role="menu" className={`absolute top-full z-30 mt-1 w-72 rounded-control border border-line bg-surface-raised p-1.5 shadow-lg ${allineaDestra ? "right-0" : "left-0"}`}>
          {gruppi.map((g) => (
            <div key={g.id} className="py-0.5">
              {gruppi.length > 1 && <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{g.label}</div>}
              {g.items.map((v) => {
                const sel = corrente?.href === v.href;
                return (
                  <Link key={v.href} role="menuitem" href={v.href} aria-current={sel ? "page" : undefined}
                    className={`flex min-h-[44px] items-start gap-3 rounded-control px-3 py-2 text-sm ${sel ? "bg-brand-light text-brand" : "text-ink hover:bg-surface"}`}>
                    <NavIcon name={v.icon} className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="flex flex-col">
                      <span className={sel ? "font-semibold" : "font-medium"}>{v.label}</span>
                      {v.descr && <span className="text-xs text-ink-muted">{v.descr}</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
