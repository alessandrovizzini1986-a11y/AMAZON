/**
 * Attività della pagina per le decorazioni festive: visibile (Page Visibility API) e usata di recente.
 * Condiviso tra gli accenti CSS e il motore canvas, che lo usano per fermarsi a pagina nascosta
 * o dopo un minuto senza input e ripartire al primo input.
 */

/** Input che contano come attività (tutti passivi: non rallentano scroll e digitazione). */
export const EVENTI_INPUT = ["mousemove", "keydown", "touchstart", "focusin"] as const;

type Finestra = Pick<Window, "addEventListener" | "removeEventListener" | "setTimeout" | "clearTimeout">;
type Documento = Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;

export type OpzioniAttivita = {
  /** dopo quanti ms senza input la pagina è inattiva (default 60 s) */
  inattivitaMs?: number;
  win?: Finestra;
  doc?: Documento;
  /** orologio monotono (default performance.now) */
  ora?: () => number;
};

/**
 * Osserva visibilità e inattività. `onCambio(attivo)` scatta solo quando lo stato cambia, in modo sincrono
 * dentro l'evento (a pagina nascosta il chiamante può cancellare subito il requestAnimationFrame).
 * Tornare visibile conta come input: chi torna sulla scheda ritrova l'animazione in moto.
 */
export function osservaAttivita(onCambio: (attivo: boolean) => void, o: OpzioniAttivita = {}) {
  const win = o.win ?? window, doc = o.doc ?? document;
  const ora = o.ora ?? (() => performance.now());
  const limite = o.inattivitaMs ?? 60_000;
  let ultimoInput = ora(), inattivo = false, attivo = !doc.hidden, fermo = false;
  let timer: number | undefined; // id di window.setTimeout

  const calcola = () => {
    const nuovo = !doc.hidden && !inattivo;
    if (nuovo !== attivo) { attivo = nuovo; onCambio(nuovo); }
  };
  // un solo timer, riarmato solo quando scade: mousemove non crea un timer a ogni movimento
  const programma = (ms: number) => {
    if (timer !== undefined) win.clearTimeout(timer);
    timer = win.setTimeout(controlla, ms);
  };
  const controlla = () => {
    timer = undefined;
    if (fermo) return;
    const trascorso = ora() - ultimoInput;
    if (trascorso >= limite) { inattivo = true; calcola(); }
    else programma(limite - trascorso);
  };
  const input = () => {
    ultimoInput = ora();
    if (inattivo) { inattivo = false; programma(limite); calcola(); }
  };
  const visibilita = () => {
    if (!doc.hidden) input();
    calcola();
  };

  for (const e of EVENTI_INPUT) win.addEventListener(e, input, { passive: true, capture: true });
  doc.addEventListener("visibilitychange", visibilita);
  programma(limite);

  return {
    get attivo() { return attivo; },
    stop() {
      fermo = true;
      if (timer !== undefined) win.clearTimeout(timer);
      timer = undefined;
      for (const e of EVENTI_INPUT) win.removeEventListener(e, input, { capture: true });
      doc.removeEventListener("visibilitychange", visibilita);
    },
  };
}

/** Ascolta una media query (anche sui Safari < 14, che hanno solo addListener). Restituisce la funzione per smettere. */
export function ascoltaMedia(mq: MediaQueryList, fn: () => void): () => void {
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }
  mq.addListener(fn);
  return () => mq.removeListener(fn);
}
