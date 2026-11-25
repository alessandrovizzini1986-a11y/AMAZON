"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Accento, Festivita } from "@/domain/festivita";
import { ascoltaMedia, osservaAttivita } from "./attivita";
import { lazySicuro } from "./lazySicuro";
import type { Rettangolo } from "./motore";
import { CSS_FESTIVITA } from "./stile";

/**
 * Il motore canvas è un altro chunk (import() asincrono): si scarica solo con decorazioni accese e movimento consentito.
 * Se non arriva (dopo i tentativi), niente animazione e nessun errore verso la pagina: resta l'accento fermo.
 */
const CanvasFestivo = lazySicuro(() => import("./CanvasFestivo"));

/** Scelta dell'utente, ricordata nel browser ("off" = spente). */
export const CHIAVE_PREFERENZA = "fleetdsp.decorazioni-festive";
const MOTO_RIDOTTO = "(prefers-reduced-motion: reduce)";

const leggiPreferenza = () => {
  try { return localStorage.getItem(CHIAVE_PREFERENZA) !== "off"; } catch { return true; }
};
const motoRidotto = () => typeof window.matchMedia === "function" && window.matchMedia(MOTO_RIDOTTO).matches;

/**
 * Livello animato: fisso, sotto il modulo di login (z-index 0 contro z-10 della colonna del form),
 * mai cliccabile, nascosto ai lettori di schermo. Stili inline: i vincoli valgono qualunque cosa succeda al CSS.
 */
const LIVELLO: CSSProperties = { position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" };

/**
 * Decorazioni di una festività (chunk lazy, solo nei giorni di festa): micro-accento SVG sulla card,
 * interruttore accessibile sotto il piè di pagina, canvas animato in un portal sul body.
 */
export default function DecorFestivo({ festa, colonna }: { festa: Festivita; colonna: RefObject<HTMLElement | null> }): ReactNode {
  const [accese, setAccese] = useState(leggiPreferenza); // montato solo nel browser, dopo il primo render: nessun problema di idratazione
  const [ridotto, setRidotto] = useState(motoRidotto);
  const accenti = useRef<HTMLDivElement>(null);
  const interruttore = useRef<HTMLButtonElement>(null);

  // prefers-reduced-motion seguito dal vivo: se si attiva il canvas si smonta e restano solo gli accenti fermi
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(MOTO_RIDOTTO);
    setRidotto(mq.matches);
    return ascoltaMedia(mq, () => setRidotto(mq.matches));
  }, []);

  // la scelta fatta in un'altra scheda vale subito anche qui
  useEffect(() => {
    const su = (e: StorageEvent) => { if (e.key === CHIAVE_PREFERENZA || e.key === null) setAccese(leggiPreferenza()); };
    window.addEventListener("storage", su);
    return () => window.removeEventListener("storage", su);
  }, []);

  // anche le animazioni CSS degli accenti si fermano a pagina nascosta o dopo un minuto senza input
  useEffect(() => {
    const el = accenti.current;
    if (!el || !accese || ridotto) return;
    const o = osservaAttivita((attivo) => el.classList.toggle("festa-pausa", !attivo));
    el.classList.toggle("festa-pausa", !o.attivo);
    return () => { o.stop(); el.classList.remove("festa-pausa"); };
  }, [accese, ridotto]);

  const cambia = () => {
    const v = !accese;
    setAccese(v);
    try { localStorage.setItem(CHIAVE_PREFERENZA, v ? "on" : "off"); } catch { /* storage non disponibile: vale per questa visita */ }
  };

  // zone del modulo di login (card + piè di pagina) e dell'interruttore: il canvas non ci disegna sopra
  const zona = useCallback((): Rettangolo[] => {
    const rett = (el: Element | null | undefined) => {
      const r = el?.getBoundingClientRect();
      return r ? [{ l: r.left, t: r.top, r: r.right, b: r.bottom }] : [];
    };
    return [...rett(colonna.current), ...rett(interruttore.current)];
  }, [colonna]);

  // con movimento ridotto le feste senza accento non mostrano nulla: un interruttore «premuto» non controllerebbe niente
  const controllabile = !ridotto || !!festa.accento;

  return (
    <>
      {/* React 19 lo porta nell'head una volta sola (href + precedence); resta lì anche dopo lo smontaggio, innocuo: classi tutte festa-* */}
      <style href="fleetdsp-festivita" precedence="default">{CSS_FESTIVITA}</style>
      <div ref={accenti} className="festa-accenti" data-festivita={festa.id}>
        {accese && festa.accento && <MicroAccento tipo={festa.accento} />}
        {controllabile && (
          <button ref={interruttore} type="button" className="festa-interruttore" aria-pressed={accese} onClick={cambia}>
            <span className="festa-levetta" aria-hidden="true" />
            Decorazioni festive
          </button>
        )}
      </div>
      {accese && !ridotto && createPortal(
        <div className="festa-livello" style={LIVELLO} aria-hidden="true">
          {festa.effetto === "lumi" && <div className="festa-bagliore" />}
          <Suspense fallback={null}><CanvasFestivo effetto={festa.effetto} zona={zona} osserva={colonna} /></Suspense>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Micro-SVG geometrici (2–4 primitive), colore dai token via currentColor. Decorativi: nascosti ai lettori di schermo. */
function MicroAccento({ tipo }: { tipo: Accento }) {
  if (tipo === "tricolore") {
    return (
      <span className="festa-tricolore" aria-hidden="true">
        <svg viewBox="0 0 3 1" preserveAspectRatio="none" focusable="false">
          <rect width="1" height="1" style={{ fill: "var(--color-ok)" }} />
          <rect x="1" width="1" height="1" style={{ fill: "var(--color-line)" }} />
          <rect x="2" width="1" height="1" style={{ fill: "var(--color-danger)" }} />
        </svg>
      </span>
    );
  }
  return (
    <span className={`festa-accento festa-${tipo}`} aria-hidden="true">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" focusable="false">
        {tipo === "stella" && <>
          <path d="M10 1.5 12.2 7.8 18.5 10 12.2 12.2 10 18.5 7.8 12.2 1.5 10 7.8 7.8Z" strokeWidth="1.4" />
          <circle cx="16.6" cy="3.4" r="1.1" fill="currentColor" stroke="none" />
        </>}
        {tipo === "fiocco" && <>
          <path d="M10 2v16M3.07 6l13.86 8M3.07 14l13.86-8" strokeWidth="1.5" />
          <circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none" />
        </>}
        {tipo === "foglia" && <>
          <path d="M10 2c5.5 4 5.5 11 0 16-5.5-5-5.5-12 0-16Z" fill="currentColor" fillOpacity="0.18" strokeWidth="1.3" />
          <path d="M10 4.5v15" strokeWidth="1.2" />
          <path d="M10 9l3-2M10 13l-3-2" strokeWidth="1" />
        </>}
      </svg>
    </span>
  );
}
