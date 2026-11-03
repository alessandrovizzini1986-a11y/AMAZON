/// <reference lib="webworker" />
/**
 * Web Worker: legge i fogli richiesti del file AGGREGATO (anche 37 MB) senza
 * bloccare la pagina. Il file resta nel browser.
 */
import { leggiFoglio, type CellaX } from "./xlsxStream";

export type RichiestaAggregato = { buf: ArrayBuffer; fogli: string[]; colonne?: string[] };
export type RispostaAggregato =
  | { tipo: "progress"; foglio: string; fase: string; byte: number }
  | { tipo: "fine"; fogli: { nome: string; righe: Record<string, CellaX>[]; mancanti: string[]; errore?: string }[] }
  | { tipo: "errore"; messaggio: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<RichiestaAggregato>) => {
  const { buf, fogli, colonne } = e.data;
  const out: { nome: string; righe: Record<string, CellaX>[]; mancanti: string[]; errore?: string }[] = [];
  try {
    for (const nome of fogli) {
      const righe: Record<string, CellaX>[] = [];
      try {
        const r = await leggiFoglio(buf, nome, {
          colonne,
          onRiga: (x) => righe.push(x),
          onProgress: (fase, byte) => ctx.postMessage({ tipo: "progress", foglio: nome, fase, byte } satisfies RispostaAggregato),
        });
        out.push({ nome, righe, mancanti: r.mancanti });
      } catch (err) {
        out.push({ nome, righe: [], mancanti: [], errore: err instanceof Error ? err.message : String(err) });
      }
    }
    ctx.postMessage({ tipo: "fine", fogli: out } satisfies RispostaAggregato);
  } catch (err) {
    ctx.postMessage({ tipo: "errore", messaggio: err instanceof Error ? err.message : String(err) } satisfies RispostaAggregato);
  }
};
