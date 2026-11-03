"use client";

import { useRef, useState } from "react";
import { Aiuto, DoveFinisce } from "./Aiuto";
import { AIUTO } from "@/content/aiuto";

/** Zona di trascinamento file (stessa grafica dell'archivio presenze), condivisa dai moduli. */
export function Dropzone({ titolo, testo, accept, multiple = false, lavoro, onFiles, aiuto }: {
  titolo: string; testo: React.ReactNode; accept: string; multiple?: boolean; lavoro: boolean; onFiles: (f: File[]) => void;
  /** chiave di src/content/aiuto.ts: mostra "?" e dove finisce il dato */
  aiuto?: string;
}) {
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <section
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles([...e.dataTransfer.files]); }}
      className={`card flex flex-col items-center gap-3 border-2 border-dashed p-8 text-center transition-colors ${drag ? "border-brand bg-brand-light" : "border-[#c4ccd6]"}`}
    >
      <p className="flex flex-wrap items-center justify-center gap-2 text-lg font-semibold">{titolo}{aiuto && <Aiuto k={aiuto} />}</p>
      {aiuto && AIUTO[aiuto] && <DoveFinisce tipo={AIUTO[aiuto].dove} />}
      <p className="max-w-xl text-sm text-ink-muted">{testo}</p>
      <input ref={input} type="file" multiple={multiple} accept={accept} className="hidden" onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
      <button type="button" className="btn-primary" disabled={lavoro} onClick={() => input.current?.click()}>
        {lavoro ? "Lettura in corso…" : multiple ? "Oppure scegli i file" : "Oppure scegli il file"}
      </button>
    </section>
  );
}
