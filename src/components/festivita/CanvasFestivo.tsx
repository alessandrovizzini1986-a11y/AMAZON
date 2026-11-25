"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import type { Effetto } from "@/domain/festivita";
import { avviaMotore, type Rettangolo } from "./motore";

/**
 * Canvas delle decorazioni festive. Chunk a parte: si scarica solo se c'è una festa, le decorazioni
 * sono accese e il movimento è consentito. Allo smontaggio il motore si ferma e libera tutto.
 */
export default function CanvasFestivo({ effetto, zona, osserva }: {
  effetto: Effetto;
  zona: () => readonly Rettangolo[];
  osserva: RefObject<HTMLElement | null>;
}): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    // un errore qui (contesto 2D negato, browser blindati) salirebbe all'error boundary della pagina:
    // meglio nessuna animazione che un modulo di login sostituito dalla pagina d'errore
    try { return avviaMotore({ canvas: ref.current, effetto, zona, osserva: osserva.current }).stop; } catch { return; }
  }, [effetto, zona, osserva]);
  return <canvas ref={ref} style={{ display: "block", width: "100%", height: "100%" }} />;
}
