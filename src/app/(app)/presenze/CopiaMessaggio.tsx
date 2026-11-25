"use client";

import { useState } from "react";
import type { Messaggio } from "@/domain/presenze/messaggi";

/** Riquadro con il messaggio Teams di una station: Copia (testo) e Copia tabella (HTML). */
export function CopiaMessaggio({ m }: { m: Messaggio }) {
  const [esito, setEsito] = useState("");
  const conferma = (t: string) => { setEsito(t); window.setTimeout(() => setEsito(""), 2000); };
  const copiaTesto = async () => {
    try { await navigator.clipboard.writeText(m.testo); conferma("Testo copiato ✓"); } catch { conferma("Copia non riuscita"); }
  };
  const copiaTabella = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([m.html], { type: "text/html" }), "text/plain": new Blob([m.testo], { type: "text/plain" }) })]);
      conferma("Tabella copiata ✓");
    } catch {
      conferma("Copia non riuscita");
    }
  };
  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-semibold">{m.station}</span>
        <span className="text-sm text-ink-muted">{m.nAnomalie} righe</span>
        <span className="ml-auto text-xs font-semibold text-ok">{esito}</span>
        <button type="button" className="btn-primary h-9 px-3 text-xs" onClick={copiaTabella}>Copia tabella</button>
        <button type="button" className="btn-secondary h-9 px-3 text-xs" onClick={copiaTesto}>Copia solo testo</button>
      </div>
      {/* anteprima di quello che si incolla in Teams: l'HTML è composto dal sito (messaggi.ts) con i testi già protetti */}
      <div className="anteprima-messaggio max-h-72 overflow-auto rounded-control bg-surface p-3 text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: m.html }} />
    </div>
  );
}
