"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TIPI, type Tipo } from "@/domain/training/tipi";
import { aggiungiExtra, eliminaExtra, salvaNota, segnaFatto, valida } from "../actions";
import { TIPO, durataTesto } from "../ui";

export type CardAttivita = {
  id: string; tipo: Tipo; chi: string; durata: number; testo: string; extra: boolean;
  links: { href: string; label: string }[]; valida: string | null; done: boolean; validated: boolean;
};
type Sera = { id: string; leggi: { href: string; label: string }[]; nota: string; done: boolean };

const Spunta = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

function Confetti() {
  const pezzi = useMemo(() => Array.from({ length: 36 }, (_, i) => ({
    left: `${(i * 97) % 100}%`, delay: `${(i % 9) * 0.06}s`, dx: `${((i * 53) % 120) - 60}px`, rot: `${360 + ((i * 71) % 360)}deg`,
    bg: ["var(--color-info)", "var(--color-ok)", "var(--color-warn)", "var(--color-brand)"][i % 4],
  })), []);
  return (
    <div className="tr-confetti" aria-hidden>
      {pezzi.map((p, i) => <i key={i} style={{ left: p.left, animationDelay: p.delay, background: p.bg, ["--dx" as string]: p.dx, ["--rot" as string]: p.rot }} />)}
    </div>
  );
}

export function GiornoClient(props: {
  day: number; attivita: CardAttivita[]; seStesso: boolean; admin: boolean; soggettoId: string; sera: Sera;
  nota: string; notaAgg: string | null; opzioniSezioni: string[]; prima: string | null;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [done, setDone] = useState<Record<string, boolean>>(() => Object.fromEntries([...props.attivita.map((a) => [a.id, a.done]), [props.sera.id, props.sera.done]]));
  const [validated, setValidated] = useState<Record<string, boolean>>(() => Object.fromEntries(props.attivita.map((a) => [a.id, a.validated])));
  const [errore, setErrore] = useState<string | null>(null);
  const [festa, setFesta] = useState(false);
  // allinea lo stato locale quando il server rimanda dati nuovi (es. dopo un'attività extra)
  useEffect(() => { setDone(Object.fromEntries([...props.attivita.map((a) => [a.id, a.done]), [props.sera.id, props.sera.done]])); setValidated(Object.fromEntries(props.attivita.map((a) => [a.id, a.validated]))); }, [props.attivita, props.sera]);

  const ids = [...props.attivita.map((a) => a.id), ...(props.sera.leggi.length ? [props.sera.id] : [])];
  const fatte = ids.filter((id) => done[id]).length;
  const puoSpuntare = props.seStesso;

  const toggle = (id: string) => {
    if (!puoSpuntare) return;
    const nuovo = !done[id];
    const prima = ids.every((x) => done[x]);
    const next = { ...done, [id]: nuovo };
    setDone(next); setErrore(null);
    if (!prima && ids.every((x) => next[x])) { setFesta(true); setTimeout(() => setFesta(false), 2200); }
    start(async () => {
      try { await segnaFatto({ activityId: id, done: nuovo }); }
      catch { setDone((d) => ({ ...d, [id]: !nuovo })); setErrore("Non salvato: controlla la connessione e riprova."); }
    });
  };
  const toggleValida = (id: string) => {
    const nuovo = !validated[id];
    setValidated((v) => ({ ...v, [id]: nuovo }));
    start(async () => {
      try { await valida({ userId: props.soggettoId, activityId: id, valido: nuovo }); }
      catch { setValidated((v) => ({ ...v, [id]: !nuovo })); setErrore("Validazione non salvata."); }
    });
  };

  return (
    <>
      {festa && <Confetti />}
      <div className="flex items-center gap-3 text-sm">
        <span className="font-semibold tabular-nums">{fatte}/{ids.length}</span>
        <div className="tr-bar flex-1"><span style={{ width: `${ids.length ? (fatte / ids.length) * 100 : 0}%` }} /></div>
        {!puoSpuntare && <span className="badge-neutral">sola lettura</span>}
      </div>
      {errore && <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{errore}</p>}
      {props.prima && (
        <div className="card border-dashed p-5 text-center">
          <p className="text-lg font-semibold">Si parte {props.prima.toLowerCase()} alle 9:00</p>
          <p className="mt-1 text-sm text-ink-muted">Puoi già leggere le sezioni del vademecum qui sopra. Le spunte contano dal primo giorno.</p>
        </div>
      )}

      <ol className="flex flex-col gap-3">
        {props.attivita.map((a, i) => {
          const t = TIPO[a.tipo];
          const ok = a.tipo === "check" && validated[a.id];
          return (
            <li key={a.id} id={a.id} className={`card scroll-mt-28 p-4 md:p-5 ${ok ? "border-ok bg-ok-soft" : ""}`}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="tabular-nums text-ink-faint">{i + 1}.</span>
                <span className={t.cls}>{t.label}</span>
                <span className="text-ink-muted">{t.spiega} · {a.chi} · {durataTesto(a.durata)}</span>
                {a.extra && <span className="badge-info">extra</span>}
                {a.valida && <span className="badge-warn">esame {a.valida}</span>}
              </div>
              <p className="mt-2 text-[15px] leading-relaxed">{a.testo}</p>
              {a.links.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {a.links.map((l) => <li key={l.href}><Link href={l.href} className="text-info underline underline-offset-2">{l.label}</Link></li>)}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" role="checkbox" aria-checked={!!done[a.id]} disabled={!puoSpuntare} onClick={() => toggle(a.id)} className="tr-check" aria-label={`Fatto: ${a.testo.slice(0, 60)}`}>
                  {done[a.id] && <Spunta />}
                </button>
                <span className="text-sm font-medium">{done[a.id] ? "Fatto" : puoSpuntare ? "Segna come fatto" : "Non ancora fatto"}</span>
                {a.tipo === "check" && props.admin && (
                  <button type="button" onClick={() => toggleValida(a.id)} className={validated[a.id] ? "btn-secondary ml-auto border-ok text-ok" : "btn-primary ml-auto"}>
                    {validated[a.id] ? "✓ Validato" : "Validato"}
                  </button>
                )}
                {a.tipo === "check" && !props.admin && validated[a.id] && <span className="badge-ok ml-auto">validato</span>}
                {a.extra && props.admin && (
                  <button type="button" className="text-sm text-danger underline underline-offset-2" onClick={() => { if (confirm("Eliminare questa attività extra?")) start(async () => { await eliminaExtra({ id: a.id.slice(2) }); router.refresh(); }); }}>Elimina</button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {(props.sera.leggi.length > 0 || props.sera.nota) && (
        <section className="card overflow-hidden" aria-labelledby="t-sera">
          <div className="bg-brand px-4 py-3 text-ink-inverse md:px-5"><h2 id="t-sera" className="font-semibold">🌙 Stasera</h2></div>
          <div className="flex flex-col gap-3 p-4 md:p-5">
            {props.sera.leggi.length > 0 && (
              <ul className="flex flex-col gap-2">
                {props.sera.leggi.map((l) => <li key={l.href}><Link href={l.href} className="flex min-h-[44px] items-center rounded-control border border-line px-3 py-2 font-medium hover:border-info">📖 {l.label}</Link></li>)}
              </ul>
            )}
            {props.sera.nota && <p className="text-[15px] text-ink-muted">{props.sera.nota}</p>}
            {props.sera.leggi.length > 0 && (
              <div className="flex items-center gap-3">
                <button type="button" role="checkbox" aria-checked={!!done[props.sera.id]} disabled={!puoSpuntare} onClick={() => toggle(props.sera.id)} className="tr-check" aria-label="Letto">
                  {done[props.sera.id] && <Spunta />}
                </button>
                <span className="text-sm font-medium">{done[props.sera.id] ? "Letto" : "Segna come letto"}</span>
              </div>
            )}
          </div>
        </section>
      )}

      <Note day={props.day} iniziale={props.nota} agg={props.notaAgg} modificabile={props.seStesso} />

      {props.admin && <AggiungiExtra day={props.day} opzioni={props.opzioniSezioni} onFatto={() => router.refresh()} />}
    </>
  );
}

function Note({ day, iniziale, agg, modificabile }: { day: number; iniziale: string; agg: string | null; modificabile: boolean }) {
  const [testo, setTesto] = useState(iniziale);
  const [stato, setStato] = useState<string>(agg ? `Salvato il ${new Date(agg).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimo = useRef(iniziale);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const cambia = (v: string) => {
    setTesto(v); setStato("Modifiche non salvate…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (v === ultimo.current) return;
      try { const r = await salvaNota({ day, text: v }); ultimo.current = v; setStato(`Salvato alle ${new Date(r.updatedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`); }
      catch { setStato("Non salvato: riprova tra poco"); }
    }, 800);
  };
  return (
    <section className="card p-4 md:p-5" aria-labelledby="t-note">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="t-note" className="font-semibold">Note di giornata</h2>
        <span className="text-xs text-ink-muted" aria-live="polite">{stato}</span>
      </div>
      {modificabile ? (
        <textarea className="input mt-2 min-h-[140px] w-full text-[15px]" value={testo} onChange={(e) => cambia(e.target.value)} placeholder="Dubbi, cose fatte, cosa non sai ancora fare… Si salva da solo. Alessandro la legge la sera." />
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-[15px]">{testo || <span className="text-ink-muted">Nessuna nota per questo giorno.</span>}</p>
      )}
    </section>
  );
}

function AggiungiExtra({ day, opzioni, onFatto }: { day: number; opzioni: string[]; onFatto: () => void }) {
  const [aperto, setAperto] = useState(false);
  const [f, setF] = useState({ tipo: "do" as Tipo, chi: "Stagista", durata: "30", testo: "", sezioni: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [lavoro, start] = useTransition();
  const invia = () => start(async () => {
    setMsg(null);
    const sezioni = f.sezioni.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    const r = await aggiungiExtra({ day, tipo: f.tipo, chi: f.chi, durata: Number(f.durata) || 30, testo: f.testo, sezioni }).catch((e: unknown) => ({ errore: e instanceof Error ? e.message : "Errore" }));
    if ("errore" in r && r.errore) { setMsg(r.errore); return; }
    setF((x) => ({ ...x, testo: "", sezioni: "" })); setAperto(false); onFatto();
  });
  if (!aperto) return <button type="button" className="btn-secondary self-start" onClick={() => setAperto(true)}>+ Aggiungi attività</button>;
  return (
    <section className="card flex flex-col gap-3 p-4 md:p-5" aria-label="Nuova attività extra">
      <h2 className="font-semibold">Nuova attività (extra, giorno {day})</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm"><span className="label">Tipo</span>
          <select className="input" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as Tipo })}>{TIPI.map((t) => <option key={t} value={t}>{TIPO[t].label} — {TIPO[t].spiega}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-sm"><span className="label">Chi</span><input className="input" value={f.chi} onChange={(e) => setF({ ...f, chi: e.target.value })} /></label>
        <label className="flex flex-col gap-1 text-sm"><span className="label">Durata (minuti)</span><input className="input" inputMode="numeric" value={f.durata} onChange={(e) => setF({ ...f, durata: e.target.value })} /></label>
      </div>
      <label className="flex flex-col gap-1 text-sm"><span className="label">Testo</span><textarea className="input min-h-[90px]" value={f.testo} onChange={(e) => setF({ ...f, testo: e.target.value })} /></label>
      <label className="flex flex-col gap-1 text-sm"><span className="label">Sezioni del vademecum (facoltative, separate da virgola: 04-multe-albero-template o 04-multe-albero-template#ancora)</span>
        <input className="input" list="t-sezioni" value={f.sezioni} onChange={(e) => setF({ ...f, sezioni: e.target.value })} />
        <datalist id="t-sezioni">{opzioni.map((o) => <option key={o} value={o} />)}</datalist>
      </label>
      {msg && <p role="alert" className="text-sm text-danger">{msg}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-primary" disabled={lavoro || f.testo.trim().length < 3} onClick={invia}>{lavoro ? "Salvo…" : "Aggiungi"}</button>
        <button type="button" className="btn-secondary" onClick={() => setAperto(false)}>Annulla</button>
      </div>
    </section>
  );
}
