"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Aiuto, DoveFinisce } from "./Aiuto";
import { AIUTO } from "@/content/aiuto";
import { accetta, archivia, riprendi, tuttiMeta, type MetaArchiviato } from "@/lib/archivioFile";

const quando = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB` : `${Math.ceil(n / 1024)} KB`);

/**
 * Zona di trascinamento file, condivisa dai moduli. Ogni file trascinato resta nell'archivio di questo PC
 * (src/lib/archivioFile.ts) e si riprende con "Dall'archivio", anche da un'altra sezione. archivio={false} per i file riservati.
 */
export function Dropzone({ titolo, testo, accept, multiple = false, lavoro, onFiles, aiuto, archivio = true }: {
  titolo: string; testo: React.ReactNode; accept: string; multiple?: boolean; lavoro: boolean; onFiles: (f: File[]) => void;
  /** chiave di src/content/aiuto.ts: mostra "?" e dove finisce il dato */
  aiuto?: string;
  archivio?: boolean;
}) {
  const [drag, setDrag] = useState(false);
  const [elenco, setElenco] = useState<MetaArchiviato[] | null>(null);
  const [scelti, setScelti] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const usa = (files: File[]) => { if (archivio && files.length) void archivia(files, titolo); onFiles(files); };
  const apri = async () => { const m = await tuttiMeta().catch(() => []); setElenco(m.filter((x) => accetta(accept, x.nome))); setScelti([]); };
  const prendi = async (hashes: string[]) => { const f = await riprendi(hashes, titolo); setElenco(null); onFiles(f); };
  return (
    <section
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); usa([...e.dataTransfer.files]); }}
      className={`card flex flex-col items-center gap-3 border-2 border-dashed p-8 text-center transition-colors ${drag ? "border-brand bg-brand-light" : "border-[#c4ccd6]"}`}
    >
      <p className="flex flex-wrap items-center justify-center gap-2 text-lg font-semibold">{titolo}{aiuto && <Aiuto k={aiuto} />}</p>
      {aiuto && AIUTO[aiuto] && <DoveFinisce tipo={AIUTO[aiuto].dove} />}
      <p className="max-w-xl text-sm text-ink-muted">{testo}</p>
      <input ref={input} type="file" multiple={multiple} accept={accept} className="hidden" onChange={(e) => { usa([...(e.target.files ?? [])]); e.target.value = ""; }} />
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="btn-primary" disabled={lavoro} onClick={() => input.current?.click()}>
          {lavoro ? "Lettura in corso…" : multiple ? "Oppure scegli i file" : "Oppure scegli il file"}
        </button>
        {archivio && <button type="button" className="btn-secondary" disabled={lavoro} onClick={() => (elenco ? setElenco(null) : apri())} aria-expanded={!!elenco}>Dall&apos;archivio di questo PC</button>}
      </div>
      {elenco && (
        <div className="w-full max-w-2xl rounded-control border border-line bg-surface-raised p-3 text-left text-sm">
          {elenco.length === 0 ? <p className="text-ink-muted">Nessun file adatto nell&apos;archivio. I file che trascini restano qui per {120} giorni.</p> : (
            <>
              <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {elenco.map((x) => (
                  <li key={x.hash}>
                    <label className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-control px-2 hover:bg-surface">
                      <input type={multiple ? "checkbox" : "radio"} name="archivio" className="h-4 w-4" checked={scelti.includes(x.hash)}
                        onChange={(e) => setScelti(multiple ? (e.target.checked ? [...scelti, x.hash] : scelti.filter((h) => h !== x.hash)) : [x.hash])} />
                      <span className="flex-1 break-all">{x.nome}</span>
                      <span className="whitespace-nowrap text-xs text-ink-muted">{x.sezione} · {quando(x.usatoIl)} · {kb(x.dimensione)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" className="btn-primary" disabled={!scelti.length || lavoro} onClick={() => prendi(scelti)}>Usa {scelti.length > 1 ? `${scelti.length} file` : "il file"}</button>
                <Link href="/archivio" className="text-xs text-brand underline">Gestisci l&apos;archivio</Link>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
