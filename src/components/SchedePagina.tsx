"use client";

import { useEffect, useState } from "react";

/**
 * Schede dentro una pagina lunga: mostra solo le parti con data-scheda="<id>" della scheda scelta.
 * La scheda si sceglie con ?sezione=<id> o con un link #<id> (anche di un elemento dentro la scheda); senza
 * JavaScript si vede tutto. Il cambio aggiorna l'indirizzo, così il link si può copiare.
 */
export function SchedePagina({ schede, etichetta = "Parti della pagina" }: { schede: { id: string; label: string }[]; etichetta?: string }) {
  const [attiva, setAttiva] = useState<string | null>(null);
  useEffect(() => {
    const scegli = () => {
      const q = new URLSearchParams(window.location.search).get("sezione");
      const h = window.location.hash.slice(1);
      const daHash = h ? (document.getElementById(h)?.closest("[data-scheda]") as HTMLElement | null)?.dataset.scheda ?? (schede.some((s) => s.id === h) ? h : null) : null;
      setAttiva(daHash ?? (q && schede.some((s) => s.id === q) ? q : schede[0].id));
    };
    scegli();
    window.addEventListener("hashchange", scegli);
    return () => window.removeEventListener("hashchange", scegli);
  }, [schede]);
  useEffect(() => {
    if (!attiva) return;
    document.querySelectorAll<HTMLElement>("[data-scheda]").forEach((el) => { el.hidden = el.dataset.scheda !== attiva; });
    const h = window.location.hash.slice(1);
    if (h) document.getElementById(h)?.scrollIntoView({ block: "start" });
  }, [attiva]);
  const vai = (id: string) => {
    setAttiva(id);
    const u = new URL(window.location.href);
    u.searchParams.set("sezione", id); u.hash = "";
    window.history.replaceState(null, "", u.toString());
  };
  return (
    <nav aria-label={etichetta} className="sticky top-14 z-10 -mx-4 flex gap-2 overflow-x-auto bg-surface/95 px-4 py-2 backdrop-blur md:top-[68px] md:mx-0 md:px-0 print:hidden">
      {schede.map((s) => (
        <button key={s.id} type="button" onClick={() => vai(s.id)} aria-current={attiva === s.id ? "true" : undefined}
          className={`min-h-[40px] shrink-0 rounded-full border px-4 text-sm font-medium transition-colors ${attiva === s.id ? "border-brand bg-brand text-white" : "border-line bg-surface-raised text-ink hover:border-brand"}`}>
          {s.label}
        </button>
      ))}
    </nav>
  );
}
