"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/app/login/actions";
import { NavIcon } from "./icons";
import { menuAttivo, vocePrincipale, type NavItem } from "./navModel";

/**
 * Voce "Menu" della barra in basso (telefono): apre un pannello dal basso con tutte le
 * voci del ruolo, l'account e l'uscita. Dialog nativo: Esc chiude, il focus torna al pulsante.
 */
export function MenuMobile({ voci, inBarra, utente }: { voci: NavItem[]; inBarra: NavItem[]; utente: { nome: string; ruolo: string } }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const attivo = menuAttivo(pathname, inBarra);
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
        <div className="flex max-h-[80vh] flex-col overflow-y-auto px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-ink-muted">{utente.nome} · {utente.ruolo}</span>
            <button type="button" className="flex h-11 w-11 items-center justify-center rounded-control text-ink-muted" aria-label="Chiudi il menu" onClick={() => ref.current?.close()}>✕</button>
          </div>
          <nav aria-label="Tutte le sezioni" className="grid grid-cols-2 gap-2">
            {voci.map((v) => {
              const on = vocePrincipale(pathname, v.href);
              return (
                <Link key={v.href} href={v.href} aria-current={on ? "page" : undefined}
                  className={`flex min-h-[52px] items-center gap-3 rounded-control border px-3 text-[15px] font-medium ${on ? "border-brand bg-brand-light text-brand" : "border-line text-ink"}`}>
                  <NavIcon name={v.icon} className="h-5 w-5 shrink-0" />{v.label}
                </Link>
              );
            })}
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

/** Tablet (768–1279 px): "Altro" a tendina con le voci che non stanno nella barra in alto. */
export function AltroTablet({ voci, etichetta = "Altro" }: { voci: NavItem[]; etichetta?: string }) {
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
  const on = voci.some((v) => vocePrincipale(pathname, v.href));
  return (
    <div ref={box} className="relative">
      <button type="button" aria-expanded={aperto} aria-haspopup="menu" onClick={() => setAperto(!aperto)}
        className={`whitespace-nowrap rounded-control px-2.5 py-2.5 text-[15px] ${on ? "bg-brand-light font-semibold text-brand" : "font-medium text-[#3c4a5c] hover:bg-surface"}`}>{etichetta} ▾</button>
      {aperto && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-56 rounded-control border border-line bg-surface-raised p-1 shadow-lg">
          {voci.map((v) => <Link key={v.href} role="menuitem" href={v.href} aria-current={vocePrincipale(pathname, v.href) ? "page" : undefined}
            className={`flex min-h-[44px] items-center gap-3 rounded-control px-3 text-sm ${vocePrincipale(pathname, v.href) ? "bg-brand-light font-semibold text-brand" : "text-ink hover:bg-surface"}`}><NavIcon name={v.icon} className="h-4 w-4" />{v.label}</Link>)}
        </div>
      )}
    </div>
  );
}
