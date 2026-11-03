import type { CellaX } from "./xlsxStream";
import type { RichiestaAggregato, RispostaAggregato } from "./aggregato.worker";

/** Avvia il worker e restituisce le righe dei fogli richiesti. */
export function leggiAggregato(file: File, fogli: string[], colonne: string[] | undefined, onProgress: (msg: string) => void) {
  return new Promise<{ nome: string; righe: Record<string, CellaX>[]; mancanti: string[]; errore?: string }[]>(async (resolve, reject) => {
    const w = new Worker(new URL("./aggregato.worker.ts", import.meta.url));
    const tot = file.size;
    w.onmessage = (e: MessageEvent<RispostaAggregato>) => {
      const m = e.data;
      if (m.tipo === "progress") onProgress(`${m.foglio}: lettura ${m.fase === "testi" ? "testi condivisi" : "righe"} · ${(m.byte / 1e6).toFixed(0)} MB decompressi (file ${(tot / 1e6).toFixed(0)} MB)`);
      else if (m.tipo === "fine") { w.terminate(); resolve(m.fogli); }
      else { w.terminate(); reject(new Error(m.messaggio)); }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || "errore nel worker")); };
    const buf = await file.arrayBuffer();
    w.postMessage({ buf, fogli, colonne } satisfies RichiestaAggregato, [buf]);
  });
}
