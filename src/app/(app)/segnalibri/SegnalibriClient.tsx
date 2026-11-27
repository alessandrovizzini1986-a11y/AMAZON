"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Pulsante } from "@/domain/segnalibri/leggi";
import { caricaPagina, elimina, salvaTesti } from "./actions";

type Scheda = { id: string; titolo: string; descrizione: string; istruzioni: string; nomeFile: string; pulsanti: Pulsante[]; aggiornato: string };

export function SegnalibriClient({ segnalibri, admin }: { segnalibri: Scheda[]; admin: boolean }) {
  const router = useRouter();
  const [attesa, parti] = useTransition();
  const [msg, setMsg] = useState<{ testo: string; ok: boolean } | null>(null);
  const fai = (f: () => Promise<string | void>) => parti(async () => { setMsg(null); try { const t = await f(); if (t) setMsg({ testo: t, ok: true }); router.refresh(); } catch (e) { setMsg({ testo: e instanceof Error ? e.message : "Operazione non riuscita", ok: false }); } });
  const carica = (file: File | undefined, id?: string) => { if (!file) return; fai(async () => { const f = new FormData(); f.set("file", file); if (id) f.set("id", id); const r = await caricaPagina(f); if ("errore" in r) throw new Error(r.errore); return `Caricato: ${r.pulsanti} ${r.pulsanti === 1 ? "pulsante" : "pulsanti"}.`; }); };

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-2 p-3 text-sm md:p-4">
        <h2 className="text-base font-semibold">Come si mette un segnalibro nel browser</h2>
        <ol className="list-decimal pl-5">
          <li>Fai comparire la barra dei preferiti: <b>Ctrl+Maiusc+B</b> (su Mac <b>Cmd+Maiusc+B</b>).</li>
          <li><b>Trascina</b> il pulsante blu nella barra. Si fa una volta sola per ogni computer.</li>
          <li>Quando sei sul portale giusto, clicca il segnalibro nella barra.</li>
        </ol>
        <p className="text-ink-muted">Se il trascinamento non funziona: premi &quot;Copia il codice&quot;, crea a mano un nuovo preferito e incollalo nel campo dell&apos;indirizzo (URL). Qui dentro i pulsanti non fanno nulla: lavorano solo sul portale per cui sono fatti.</p>
      </section>

      {msg && <p role="status" className={`rounded-control px-3 py-2 text-sm ${msg.ok ? "bg-brand-light text-brand" : "bg-orange-50 text-orange-800"}`}>{msg.testo}</p>}
      {segnalibri.length === 0 && <p className="card p-4 text-sm text-ink-muted">Non c&apos;è ancora nessun segnalibro.{admin ? " Caricane uno qui sotto." : ""}</p>}
      {segnalibri.map((s) => <SchedaSegnalibro key={s.id} s={s} admin={admin} attesa={attesa} fai={fai} carica={carica} dire={(t) => setMsg({ testo: t, ok: true })} />)}

      {admin && (
        <section className="card flex flex-col gap-2 p-3 md:p-4">
          <h2 className="text-base font-semibold">Aggiungi un segnalibro</h2>
          <p className="text-sm text-ink-muted">Carica la pagina .html che contiene il pulsante (quella che ti prepara chi scrive il segnalibro). Il sito prende i pulsanti e le istruzioni; titolo e testi li puoi correggere dopo. Non caricare pagine con password scritte dentro.</p>
          <div><label className="btn-primary cursor-pointer">Scegli il file .html<input type="file" accept=".html,.htm,text/html" className="sr-only" disabled={attesa} onChange={(e) => { carica(e.target.files?.[0]); e.target.value = ""; }} /></label></div>
        </section>
      )}
    </div>
  );
}

function SchedaSegnalibro({ s, admin, attesa, fai, carica, dire }: { s: Scheda; admin: boolean; attesa: boolean; fai: (f: () => Promise<string | void>) => void; carica: (f: File | undefined, id?: string) => void; dire: (t: string) => void }) {
  const [mod, setMod] = useState(false);
  const [t, setT] = useState({ titolo: s.titolo, descrizione: s.descrizione, istruzioni: s.istruzioni });
  return (
    <section className="card flex flex-col gap-3 p-3 md:p-4">
      <div>
        <h2 className="text-base font-semibold">{s.titolo}</h2>
        {s.descrizione && <p className="text-sm text-ink-muted">{s.descrizione}</p>}
      </div>
      <ul className="flex flex-col gap-2">
        {s.pulsanti.map((p) => (
          <li key={p.nome} className="flex flex-wrap items-center gap-2">
            <Trascinabile p={p} dire={dire} />
            <button type="button" className="btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(p.codice); dire(`Codice di "${p.nome}" copiato: incollalo nel campo indirizzo di un nuovo preferito.`); } catch { dire("Il browser non mi lascia copiare: usa il trascinamento."); } }}>Copia il codice</button>
          </li>
        ))}
      </ul>
      {s.istruzioni && (
        <details className="text-sm">
          <summary className="min-h-[40px] cursor-pointer py-2 font-semibold text-brand">Istruzioni</summary>
          <div className="whitespace-pre-line border-t border-line pt-2">{s.istruzioni}</div>
        </details>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
        <a className="font-semibold text-brand underline" href={`/api/segnalibri/${s.id}`}>Scarica la pagina completa</a>
        <span>Aggiornato il {s.aggiornato}</span>
      </div>
      {admin && !mod && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <button type="button" className="btn-secondary" onClick={() => setMod(true)}>Modifica i testi</button>
          <label className="btn-secondary cursor-pointer">Sostituisci con un file nuovo<input type="file" accept=".html,.htm,text/html" className="sr-only" disabled={attesa} onChange={(e) => { carica(e.target.files?.[0], s.id); e.target.value = ""; }} /></label>
          <button type="button" className="btn-secondary text-red-700" disabled={attesa} onClick={() => { if (window.confirm(`Eliminare "${s.titolo}"? Chi lo ha già nella barra dei preferiti continua ad averlo.`)) fai(async () => { await elimina(s.id); return "Eliminato."; }); }}>Elimina</button>
        </div>
      )}
      {admin && mod && (
        <div className="flex flex-col gap-2 border-t border-line pt-3 text-sm">
          <label className="flex flex-col gap-1">Titolo<input className="input" value={t.titolo} maxLength={120} onChange={(e) => setT({ ...t, titolo: e.target.value })} /></label>
          <label className="flex flex-col gap-1">A cosa serve (una riga)<input className="input" value={t.descrizione} maxLength={300} onChange={(e) => setT({ ...t, descrizione: e.target.value })} /></label>
          <label className="flex flex-col gap-1">Istruzioni<textarea className="input min-h-[200px]" value={t.istruzioni} onChange={(e) => setT({ ...t, istruzioni: e.target.value })} /></label>
          <div className="flex gap-2"><button type="button" className="btn-primary" disabled={attesa || !t.titolo.trim()} onClick={() => fai(async () => { await salvaTesti({ id: s.id, ...t }); setMod(false); return "Testi salvati."; })}>Salva</button><button type="button" className="btn-secondary" onClick={() => { setT({ titolo: s.titolo, descrizione: s.descrizione, istruzioni: s.istruzioni }); setMod(false); }}>Annulla</button></div>
        </div>
      )}
    </section>
  );
}

/** Il pulsante da trascinare nella barra dei preferiti. L'indirizzo "javascript:" si mette a mano sul link: React non lo scrive. Cliccato qui non fa nulla. */
function Trascinabile({ p, dire }: { p: Pulsante; dire: (t: string) => void }) {
  const ref = useRef<HTMLAnchorElement | null>(null);
  return (
    <a ref={(el) => { ref.current = el; el?.setAttribute("href", p.codice); }} draggable title="Trascinami nella barra dei preferiti"
      onClick={(e) => { e.preventDefault(); dire(`"${p.nome}" va trascinato nella barra dei preferiti: cliccato qui non fa nulla.`); }}
      className="inline-flex min-h-[44px] cursor-grab items-center gap-2 rounded-control bg-brand px-4 text-sm font-semibold text-white">
      <span aria-hidden>⠿</span>{p.nome}
    </a>
  );
}
