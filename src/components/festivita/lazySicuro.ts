import { lazy, type ComponentType } from "react";

/**
 * React.lazy che non rompe mai la pagina di login. Se il chunk non arriva ritenta (Wi-Fi che si riconnette
 * dopo lo standby: webpack rifà la richiesta di un chunk fallito) con attese crescenti; dopo l'ultimo
 * tentativo rende null invece di lanciare l'errore, che salirebbe all'error boundary e farebbe sparire il form.
 */
export function lazySicuro<P extends object>(
  carica: () => Promise<{ default: ComponentType<P> }>,
  tentativi = 3,
  attesaMs = 2_000,
) {
  const prova = (n: number, attesa: number): Promise<{ default: ComponentType<P> }> =>
    carica().catch((e: unknown) => {
      if (n <= 1) throw e;
      return new Promise<void>((ok) => setTimeout(ok, attesa)).then(() => prova(n - 1, attesa * 2));
    });
  return lazy(() => prova(tentativi, attesaMs).catch(() => ({ default: Nulla as ComponentType<P> })));
}

function Nulla() {
  return null;
}
