"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TOLLERANZE } from "@/domain/carburante/riconciliazione";
import { segnaGuida } from "./actions";
import { CHIAVE_GUIDA, EVENTO_GUIDA, STILE_STATO } from "./testi";

type Rett = { top: number; left: number; width: number; height: number };
type Posto = { modo: "centro" } | { modo: "alto" } | { modo: "basso" } | { modo: "libero"; top: number; left: number };
type Passo = { id: string; bersaglio: string; titolo: string; testo: React.ReactNode[] };

const MARGINE = 8, STRETTO = 640, LARGO = 420;
const RIMANDATA = `${CHIAVE_GUIDA}:rimandata`;

/** primo elemento visibile con quel data-guida */
const trova = (b: string) => Array.from(document.querySelectorAll<HTMLElement>(`[data-guida~="${b}"]`)).find((e) => e.getClientRects().length > 0) ?? null;
const pocoMoto = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const num = (x: number) => x.toLocaleString("it-IT");

function passi(t: typeof TOLLERANZE): Passo[] {
  return [
    {
      id: "incrocio", bersaglio: "schede", titolo: "Come funziona l'incrocio",
      testo: [
        <>Le carte Q8 di DER2 e GLS sono <b>del driver</b>, non del furgone. Il furgone si ricostruisce: è quello che la telematica Targa vede fare gasolio entro <b>{t.finestraMin} minuti</b> dal pagamento.</>,
        <>I litri devono tornare entro <b>{t.litriAssoluti} litri o il {num(t.litriPercento * 100)} %</b> (vale la più larga delle due) e il furgone deve essere al distributore Q8.</>,
        <>Targa misura il gasolio che <b>entra davvero nel serbatoio</b>: se ne entra meno di quello pagato, la differenza finisce in queste schede, in litri e in euro.</>,
      ],
    },
    {
      id: "badge", bersaglio: "tabella", titolo: "Come leggere il tipo e il delta",
      testo: [
        <span key="b" className="flex flex-col gap-1">
          {(["SERBATOIO_FERMO", "LITRI", "LUOGO", "SENZA_Q8", "REGOLARE", "NON_VERIFICABILE"] as const).map((s) => (
            <span key={s} className="flex items-center gap-2"><span aria-hidden>{STILE_STATO[s].icona}</span><span><b>{STILE_STATO[s].testo}</b>{s === "SERBATOIO_FERMO" ? ": carta usata, ma il furgone abituale è passato dal distributore senza che il serbatoio salisse." : s === "LITRI" ? ": sono entrati meno litri di quelli pagati." : s === "LUOGO" ? ": il furgone era da un'altra parte." : s === "SENZA_Q8" ? ": gasolio entrato senza un pagamento Q8 vicino." : s === "REGOLARE" ? ": tutto torna (nascosti di solito)." : ": mancano i dati per dirlo (nascosti di solito)."}</span></span>
          ))}
        </span>,
        <><b>Delta</b> = litri Targa meno litri Q8: <b>negativo</b> vuol dire pagati più litri di quelli entrati. Gli <b>€</b> sono il valore di quei litri al prezzo pagato, IVA esclusa.</>,
      ],
    },
    {
      id: "azioni", bersaglio: "azioni", titolo: "Controllare e chiudere una riga",
      testo: [
        <><b>Apri la giornata</b> porta alla Giornata di consegna di quel furgone: vedi il percorso, le soste e dove ha fatto gasolio.</>,
        <>Quando hai capito il perché (furgone sostitutivo, sensore guasto, tanica…), premi <b>Giustifica / Archivia</b>, scegli il motivo e scrivi una nota. La riga sparisce e non conta più nei totali.</>,
        <>Con <b>Mostra archiviate</b> le rivedi, con chi e quando le ha chiuse; <b>Riapri</b> le rimette tra quelle da guardare.</>,
      ],
    },
    {
      id: "filtri", bersaglio: "filtri", titolo: "Filtri ed export",
      testo: [
        <>Scegli mese, flotta e targa. Regolari e non verificabili sono nascosti: accendili se ti servono.</>,
        <>I filtri restano nell&apos;indirizzo della pagina: <b>Excel</b> e <b>CSV</b> scaricano esattamente quello che vedi.</>,
      ],
    },
    {
      id: "dati", bersaglio: "alimenta", titolo: "Da dove arrivano i dati",
      testo: [
        <>I pagamenti arrivano dal file Q8 del mese, caricato in <b>Carburante e Telepass → Q8</b>. I rifornimenti arrivano da soli ogni notte dalla telematica.</>,
        <><b>Come alimentare i dati</b> spiega i passi e mostra cosa manca. Puoi rivedere questa guida quando vuoi con <b>Rivedi guida</b>.</>,
      ],
    },
  ];
}

/**
 * Guida della pagina: tappe che illuminano gli elementi veri (data-guida) con il resto in ombra.
 * Parte da sola la prima volta (se il server non l'ha segnata e il browser non la ricorda); "Rivedi guida" la riapre.
 * Indietro, Avanti, Salta; Esc la chiude; il fuoco resta nel riquadro.
 */
export function GuidaCarburante({ vista, tolleranze }: { vista: boolean; tolleranze: typeof TOLLERANZE }) {
  const lista = useMemo(() => passi(tolleranze), [tolleranze]);
  const [i, setI] = useState<number | null>(null);
  const [rect, setRect] = useState<Rett | null>(null);
  const [posto, setPosto] = useState<Posto>({ modo: "centro" });
  const scheda = useRef<HTMLDivElement>(null), titolo = useRef<HTMLHeadingElement>(null), prima = useRef<HTMLElement | null>(null);
  const passo = i === null ? null : lista[i];
  const ultimo = i === lista.length - 1;

  const apri = useCallback(() => {
    prima.current = document.activeElement as HTMLElement | null;
    document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach((d) => d.close());
    setRect(null); setI(0);
  }, []);
  const chiudi = useCallback(() => { setI(null); setRect(null); prima.current?.focus?.(); }, []);
  const rimanda = useCallback(() => { try { sessionStorage.setItem(RIMANDATA, "1"); } catch { /* ok */ } chiudi(); }, [chiudi]);
  const segna = useCallback((esito: "completato" | "saltato") => {
    try { localStorage.setItem(CHIAVE_GUIDA, esito); } catch { /* ok */ }
    void segnaGuida(esito).catch(() => { /* resta il segno nel browser */ });
    chiudi();
  }, [chiudi]);
  const avanti = useCallback(() => { if (i === null) return; if (i === lista.length - 1) segna("completato"); else setI(i + 1); }, [i, lista.length, segna]);
  const indietro = useCallback(() => { if (i !== null && i > 0) setI(i - 1); }, [i]);

  // partenza da sola alla prima apertura; "Rivedi guida" la riapre sempre
  useEffect(() => {
    const suEvento = () => apri();
    window.addEventListener(EVENTO_GUIDA, suEvento);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (!vista) {
      let giaVista = true;
      try { giaVista = !!localStorage.getItem(CHIAVE_GUIDA) || sessionStorage.getItem(RIMANDATA) === "1"; } catch { giaVista = true; }
      if (!giaVista) t = setTimeout(apri, 700);
    }
    return () => { window.removeEventListener(EVENTO_GUIDA, suEvento); if (t) clearTimeout(t); };
  }, [vista, apri]);

  // trova l'elemento della tappa, lo porta in vista e ne segue la posizione
  useEffect(() => {
    if (!passo) return;
    let el: HTMLElement | null = null, tentativi = 0, raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const misura = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (el) { const r = el.getBoundingClientRect(); setRect({ top: r.top, left: r.left, width: r.width, height: r.height }); } }); };
    const cerca = () => {
      el = trova(passo.bersaglio);
      if (!el) { if (++tentativi < 15) timer = setTimeout(cerca, 100); else setRect(null); return; }
      const r = el.getBoundingClientRect(), testata = window.innerWidth < 768 ? 72 : 96;
      if (r.top < testata || r.bottom > window.innerHeight - 40) window.scrollTo({ top: Math.max(0, window.scrollY + r.top - testata), behavior: pocoMoto() ? "auto" : "smooth" });
      misura();
    };
    cerca();
    window.addEventListener("scroll", misura, { passive: true }); window.addEventListener("resize", misura);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); window.removeEventListener("scroll", misura); window.removeEventListener("resize", misura); };
  }, [passo]);

  // dove mettere il riquadro: sotto o sopra l'elemento (computer), attaccato in basso o in alto (telefono)
  useLayoutEffect(() => {
    if (!passo) return;
    if (!rect) { setPosto({ modo: "centro" }); return; }
    const vw = window.innerWidth, vh = window.innerHeight;
    if (vw < STRETTO) { setPosto({ modo: rect.top + rect.height / 2 > vh / 2 ? "alto" : "basso" }); return; }
    const h = scheda.current?.offsetHeight ?? 280, w = Math.min(LARGO, vw - 24), spazio = 14;
    const left = Math.min(Math.max(rect.left, 12), Math.max(12, vw - w - 12));
    const giu = rect.top + rect.height + MARGINE + spazio, su = rect.top - MARGINE - spazio - h;
    if (giu + h <= vh - 12) setPosto({ modo: "libero", top: giu, left });
    else if (su >= 12) setPosto({ modo: "libero", top: su, left });
    else setPosto({ modo: "libero", top: Math.max(12, vh - h - 16), left: Math.max(12, vw - w - 16) });
  }, [rect, passo]);

  // fuoco sul titolo a ogni tappa (lo legge anche lo screen reader)
  useEffect(() => { if (i !== null) titolo.current?.focus({ preventScroll: true }); }, [i]);

  // tastiera: Esc chiude, frecce per muoversi, Tab resta nel riquadro
  useEffect(() => {
    if (i === null) return;
    const tasti = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); rimanda(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); avanti(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); indietro(); }
      else if (e.key === "Tab") {
        const f = Array.from(scheda.current?.querySelectorAll<HTMLElement>("button, a[href]") ?? []).filter((x) => !(x as HTMLButtonElement).disabled);
        if (!f.length) return;
        e.preventDefault();
        const at = f.indexOf(document.activeElement as HTMLElement);
        f[(at + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    };
    document.addEventListener("keydown", tasti);
    return () => document.removeEventListener("keydown", tasti);
  }, [i, rimanda, avanti, indietro]);

  if (i === null || !passo) return null;

  const vw = window.innerWidth, vh = window.innerHeight;
  const faro = rect
    ? (() => { const t = Math.max(rect.top - MARGINE, 4), l = Math.max(rect.left - MARGINE, 4), b = Math.min(rect.top + rect.height + MARGINE, vh - 4), r = Math.min(rect.left + rect.width + MARGINE, vw - 4); return { top: t, left: l, width: Math.max(0, r - l), height: Math.max(0, b - t), opacity: 1 }; })()
    : { top: vh / 2, left: vw / 2, width: 0, height: 0, opacity: 0 };
  const stile: React.CSSProperties =
    posto.modo === "libero" ? { top: posto.top, left: posto.left, width: `min(${LARGO}px, calc(100vw - 24px))` }
    : posto.modo === "alto" ? { top: 12, left: 12, right: 12 }
    : posto.modo === "basso" ? { bottom: "calc(12px + env(safe-area-inset-bottom))", left: 12, right: 12 }
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: `min(${LARGO}px, calc(100vw - 24px))` };

  return (
    <div className="print:hidden">
      <div className="fixed inset-0 z-[60]" aria-hidden onClick={(e) => e.stopPropagation()} />
      <div aria-hidden className="pointer-events-none fixed z-[61] rounded-xl transition-all duration-200 motion-reduce:transition-none"
        style={{ top: faro.top, left: faro.left, width: faro.width, height: faro.height, boxShadow: `0 0 0 200vmax rgb(13 27 42 / 0.6), 0 0 0 2px rgb(255 255 255 / ${faro.opacity * 0.9})` }} />
      <div ref={scheda} role="dialog" aria-modal="true" aria-labelledby="guida-carb-titolo" key={passo.id}
        className="fixed z-[62] max-h-[calc(100vh-24px)] overflow-y-auto rounded-card border border-line bg-surface-raised p-4 shadow-lift md:p-5" style={stile}>
        <div className="mb-2 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin={1} aria-valuemax={lista.length} aria-valuenow={i + 1} aria-label={`Passo ${i + 1} di ${lista.length}`}>
            <div className="h-full rounded-full bg-brand" style={{ width: `${((i + 1) / lista.length) * 100}%` }} />
          </div>
          <span className="shrink-0 text-xs font-medium text-ink-muted">{i + 1} di {lista.length}</span>
        </div>
        <h2 id="guida-carb-titolo" ref={titolo} tabIndex={-1} className="text-[19px] font-semibold tracking-tight outline-none">{passo.titolo}</h2>
        <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-ink">
          {passo.testo.map((t, k) => <p key={k}>{t}</p>)}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary" onClick={indietro} disabled={i === 0}>Indietro</button>
          <button type="button" className="min-h-[40px] px-1 text-[13px] text-ink-muted underline hover:text-ink" onClick={() => segna("saltato")}>Salta</button>
          <button type="button" className="btn-primary ml-auto" onClick={avanti}>{ultimo ? "Ho finito" : "Avanti"}</button>
        </div>
        <p className="mt-2 hidden text-xs text-ink-muted md:block">Frecce per muoverti, Esc per chiudere.</p>
      </div>
    </div>
  );
}
