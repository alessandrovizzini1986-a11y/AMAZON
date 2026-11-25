"use client";

import { Suspense, useEffect, useState, type RefObject } from "react";
import { leggiAnteprima, msAllaMezzanotte, risolviFestivita, type Festivita } from "@/domain/festivita";
import { lazySicuro } from "./lazySicuro";

/**
 * Accenti, interruttore e canvas: chunk separato con import() asincrono, scaricato solo nei giorni di festa.
 * React.lazy invece di next/dynamic: qui non serve il rendering lato server (il componente compare solo
 * dopo il montaggio) e la login non si porta dietro il runtime di next/dynamic.
 * Se il chunk non arriva (rete assente, deploy nuovo con altri hash) ritenta e poi lascia le decorazioni spente:
 * l'errore non deve mai risalire all'error boundary e far sparire il modulo di login.
 */
const DecorFestivo = lazySicuro(() => import("./DecorFestivo"));

/** Tetto al timer della mezzanotte: durante lo standby i timer si fermano e la pagina può non passare da "nascosta". */
const RICONTROLLO_MS = 10 * 60_000;

/**
 * Decorazioni stagionali della pagina di login. Nei giorni feriali tutto si ferma a questo controllo di data:
 * nessun altro byte scaricato, nessuna animazione. La data si legge solo nel browser, dopo il montaggio:
 * la pagina di login è prerenderizzata al build e lì `new Date()` sarebbe la data del build.
 *
 * Anteprima per i test: /login?holiday=natale (o pasqua, 2giugno, 4ottobre, none …). Il parametro
 * resta sull'URL della login e non entra nel flusso di accesso (l'azione reindirizza sempre a "/").
 */
export function FestivitaLogin({ colonna }: { colonna: RefObject<HTMLElement | null> }) {
  const [festa, setFesta] = useState<Festivita | null>(null);

  useEffect(() => {
    const search = window.location.search;
    const forzata = leggiAnteprima(search) !== null; // anteprima (anche "none"): vale finché la pagina resta aperta
    let timer: ReturnType<typeof setTimeout> | undefined;
    const aggiorna = () => {
      const adesso = new Date();
      const f = risolviFestivita(adesso, search);
      setFesta((prima) => (prima?.id === f?.id ? prima : f)); // stessa festa: nessun nuovo render
      if (forzata) return;
      // pagina lasciata aperta (es. PC di magazzino): la festa si accende e si spegne a mezzanotte
      clearTimeout(timer);
      timer = setTimeout(aggiorna, Math.min(msAllaMezzanotte(adesso), RICONTROLLO_MS));
    };
    aggiorna();
    if (forzata) return;
    const torna = () => { if (!document.hidden) aggiorna(); };
    document.addEventListener("visibilitychange", torna);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", torna); };
  }, []);

  return festa ? <Suspense fallback={null}><DecorFestivo festa={festa} colonna={colonna} /></Suspense> : null;
}
