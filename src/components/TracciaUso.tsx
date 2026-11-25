"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Statistica d'uso: a ogni pagina aperta manda "una visita", e quando la si lascia manda i secondi in cui è rimasta in vista.
 * Non registra clic né contenuti: solo quale pagina e per quanto. Se l'invio fallisce il sito funziona lo stesso.
 */
export function TracciaUso() {
  const pathname = usePathname();
  const s = useRef({ p: "", inizio: 0, somma: 0 });

  useEffect(() => {
    const invia = (p: string, visite: number, secondi: number) => {
      if (!p || (!visite && secondi < 1)) return;
      try { navigator.sendBeacon?.("/api/uso", new Blob([JSON.stringify({ p, v: visite, s: Math.min(secondi, 1800) })], { type: "application/json" })); } catch { /* la statistica non deve mai rompere la pagina */ }
    };
    const x = s.current;
    const chiudi = () => { const sec = Math.round((x.somma + (x.inizio ? Date.now() - x.inizio : 0)) / 1000); invia(x.p, 0, sec); x.somma = 0; x.inizio = document.visibilityState === "visible" ? Date.now() : 0; };
    if (x.p && x.p !== pathname) chiudi();
    x.p = pathname; x.somma = 0; x.inizio = document.visibilityState === "visible" ? Date.now() : 0;
    invia(pathname, 1, 0);
    const vista = () => { if (document.visibilityState === "visible") x.inizio = Date.now(); else chiudi(); };
    document.addEventListener("visibilitychange", vista);
    window.addEventListener("pagehide", chiudi);
    return () => { document.removeEventListener("visibilitychange", vista); window.removeEventListener("pagehide", chiudi); };
  }, [pathname]);
  return null;
}
