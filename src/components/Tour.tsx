"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DOVE, type Dove } from "@/content/aiuto";
import type { PassoTour } from "@/content/tour";
import { segnaTour } from "@/app/(app)/tour-actions";

type Rett = { top: number; left: number; width: number; height: number };
type Posto = { modo: "centro" } | { modo: "alto" } | { modo: "basso" } | { modo: "libero"; top: number; left: number };

const MARGINE = 8, STRETTO = 640, LARGO_SCHEDA = 400;
const IN_BREVE: Record<Dove, string> = { SITO: "lo ritrovi sempre, anche da un altro PC", PC: "resta in questo browser: da un altro PC non c'è", TEMP: "sparisce quando chiudi la pagina", FILE: "va nella cartella Download, il sito non ne tiene copia" };
const TONO: Record<string, string> = { ok: "badge-ok", info: "badge-info", warn: "badge-warn", neutral: "badge-neutral" };

/** Primo elemento visibile con quel data-tour (lo stesso nome sta su menu diversi per computer, tablet e telefono). */
const trova = (b: string) => Array.from(document.querySelectorAll<HTMLElement>(`[data-tour~="${b}"]`)).find((e) => e.getClientRects().length > 0) ?? null;
const fermo = (e: HTMLElement | null): boolean => { for (let x = e; x && x !== document.body; x = x.parentElement) { const p = getComputedStyle(x).position; if (p === "fixed" || p === "sticky") return true; } return false; };
const pocoMoto = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const rett = (e: HTMLElement): Rett => { const r = e.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width, height: r.height }; };

/**
 * Tour di benvenuto: un riquadro al centro per il benvenuto, poi le tappe illuminano gli elementi veri della pagina
 * (data-tour) con il resto in ombra. Parte da solo al primo accesso con un ruolo (auto) o da Aiuto → Tour del sito (?tour=1).
 * "Più tardi" lo ripropone al prossimo accesso; finirlo o "Non mostrarlo più" lo segna sul sito per quell'utente.
 * Tastiera: frecce per muoversi, Esc per rimandare; il fuoco resta nel riquadro.
 */
export function Tour({ passi, chiave, auto, home }: { passi: PassoTour[]; chiave: string; auto: boolean; home: string }) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const [i, setI] = useState<number | null>(null);
  const [lista, setLista] = useState(passi);
  const [rect, setRect] = useState<Rett | null>(null);
  const [posto, setPosto] = useState<Posto>({ modo: "centro" });
  const scheda = useRef<HTMLDivElement>(null), titolo = useRef<HTMLHeadingElement>(null);
  const primaDelTour = useRef<HTMLElement | null>(null), avviato = useRef(false), filtrato = useRef(false);
  const aCasa = pathname === home;
  const passo = i === null ? null : lista[i];
  const ultimo = i !== null && i === lista.length - 1;

  const apri = useCallback(() => {
    primaDelTour.current = document.activeElement as HTMLElement | null;
    document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach((d) => d.close());
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); // chiude le tendine del menu
    filtrato.current = false; setLista(passi); setRect(null); setI(0);
  }, [passi]);
  const chiudi = useCallback(() => { setI(null); setRect(null); primaDelTour.current?.focus?.(); }, []);
  const rimanda = useCallback(() => { try { sessionStorage.setItem("tour:rimandato", chiave); } catch { /* ok */ } chiudi(); }, [chiave, chiudi]);
  const segna = useCallback((esito: "completato" | "saltato") => { try { sessionStorage.setItem("tour:rimandato", chiave); } catch { /* ok */ } void segnaTour(esito).catch(() => { /* si ripropone al prossimo accesso */ }); chiudi(); }, [chiave, chiudi]);
  const avanti = useCallback(() => {
    if (i === null) return;
    if (i === lista.length - 1) return segna("completato");
    if (i === 0 && !aCasa) router.push(home);
    setI(i + 1);
  }, [i, lista.length, aCasa, home, router, segna]);
  const indietro = useCallback(() => { if (i !== null && i > 0) setI(i - 1); }, [i]);

  // partenza: da sola al primo accesso, o chiesta dal menu Aiuto
  useEffect(() => {
    if (params.get("tour") === "1") { avviato.current = true; apri(); router.replace(pathname, { scroll: false }); return; }
    if (!auto || avviato.current) return;
    let rimandato = false; try { rimandato = sessionStorage.getItem("tour:rimandato") === chiave; } catch { /* ok */ }
    if (rimandato) return;
    const t = setTimeout(() => { avviato.current = true; apri(); }, 500);
    return () => clearTimeout(t);
  }, [params, auto, chiave, apri, router, pathname]);

  // sulla Home: toglie le tappe facoltative il cui elemento non c'è (es. nessun avviso)
  useEffect(() => {
    if (i === null || !aCasa || filtrato.current) return;
    const t = setTimeout(() => { filtrato.current = true; setLista((l) => l.filter((p, k) => k <= i || !p.facoltativo || !p.bersaglio || trova(p.bersaglio))); }, 150);
    return () => clearTimeout(t);
  }, [i, aCasa]);

  // trova l'elemento della tappa, lo porta in vista e ne segue la posizione
  useEffect(() => {
    if (!passo) return;
    if (!passo.bersaglio) { setRect(null); return; }
    if (!aCasa && i !== 0) return;
    let el: HTMLElement | null = null, tentativi = 0, timer: ReturnType<typeof setTimeout> | undefined, raf = 0;
    const misura = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (el) setRect(rett(el)); }); };
    const cerca = () => {
      el = trova(passo.bersaglio!);
      if (!el) { if (++tentativi < 30) timer = setTimeout(cerca, 100); else setRect(null); return; }
      if (!fermo(el)) {
        const r = el.getBoundingClientRect(), testata = window.innerWidth < 768 ? 68 : 92;
        window.scrollTo({ top: Math.max(0, window.scrollY + r.top - testata), behavior: pocoMoto() ? "auto" : "smooth" });
      }
      misura();
    };
    cerca();
    window.addEventListener("scroll", misura, { passive: true }); window.addEventListener("resize", misura);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); window.removeEventListener("scroll", misura); window.removeEventListener("resize", misura); };
  }, [passo, aCasa, i]);

  // dove mettere il riquadro: al centro, attaccato in alto/basso (telefono) o accanto all'elemento (computer)
  useLayoutEffect(() => {
    if (!passo) return;
    if (!rect) { setPosto({ modo: "centro" }); return; }
    const vw = window.innerWidth, vh = window.innerHeight;
    if (vw < STRETTO) { setPosto({ modo: rect.top > vh / 2 ? "alto" : "basso" }); return; } // in alto solo se l'elemento sta in fondo (barra del telefono)
    const h = scheda.current?.offsetHeight ?? 260, w = Math.min(LARGO_SCHEDA, vw - 24), spazio = 14;
    const dentro = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));
    const left = dentro(rect.left, 12, vw - w - 12), giu = rect.top + rect.height + MARGINE + spazio, su = rect.top - MARGINE - spazio - h;
    if (giu + h <= vh - 12) setPosto({ modo: "libero", top: giu, left });
    else if (su >= 12) setPosto({ modo: "libero", top: su, left });
    else if (rect.left + rect.width + MARGINE + spazio + w <= vw - 12) setPosto({ modo: "libero", top: dentro(rect.top, 12, vh - h - 12), left: rect.left + rect.width + MARGINE + spazio });
    else if (rect.left - MARGINE - spazio - w >= 12) setPosto({ modo: "libero", top: dentro(rect.top, 12, vh - h - 12), left: rect.left - MARGINE - spazio - w });
    else setPosto({ modo: "libero", top: vh - h - 16, left: vw - w - 16 });
  }, [rect, passo]);

  // fuoco sul titolo a ogni tappa (lo legge anche lo screen reader)
  useEffect(() => { if (i !== null) titolo.current?.focus({ preventScroll: true }); }, [i]);

  // tastiera: frecce, Esc, Tab chiuso nel riquadro
  useEffect(() => {
    if (i === null) return;
    const tasti = (e: KeyboardEvent) => {
      if (!e.isTrusted) return;
      if (e.key === "Escape") { e.preventDefault(); rimanda(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); avanti(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); indietro(); }
      else if (e.key === "Tab") {
        const f = Array.from(scheda.current?.querySelectorAll<HTMLElement>("button, a[href]") ?? []);
        if (!f.length) return;
        const at = f.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        f[(at + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    };
    document.addEventListener("keydown", tasti);
    return () => document.removeEventListener("keydown", tasti);
  }, [i, rimanda, avanti, indietro]);

  if (i === null || !passo) return null;

  const vw = typeof window === "undefined" ? 1280 : window.innerWidth, vh = typeof window === "undefined" ? 800 : window.innerHeight;
  // il faro: il rettangolo dell'elemento, tagliato ai bordi dello schermo; senza elemento è un punto al centro (tutto in ombra)
  const faro = rect
    ? (() => { const t = Math.max(rect.top - MARGINE, 4), l = Math.max(rect.left - MARGINE, 4), b = Math.min(rect.top + rect.height + MARGINE, vh - 4), r = Math.min(rect.left + rect.width + MARGINE, vw - 4); return { top: t, left: l, width: Math.max(0, r - l), height: Math.max(0, b - t), opacity: 1 }; })()
    : { top: vh / 2, left: vw / 2, width: 0, height: 0, opacity: 0 };
  const inAttesa = i > 0 && !aCasa; // sto andando alla Home
  const centro = posto.modo === "centro";
  const tappe = lista.length - 1; // il benvenuto non conta
  const benvenuto = passo.tipo === "benvenuto";

  const stileScheda: React.CSSProperties =
    posto.modo === "libero" ? { top: posto.top, left: posto.left, width: `min(${LARGO_SCHEDA}px, calc(100vw - 24px))` }
    : posto.modo === "alto" ? { top: 12, left: 12, right: 12 }
    : posto.modo === "basso" ? { bottom: "calc(12px + env(safe-area-inset-bottom))", left: 12, right: 12 }
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: `min(${benvenuto ? 520 : 460}px, calc(100vw - 24px))` };

  return (
    <div className="print:hidden">
      {/* blocca i clic sulla pagina durante il tour */}
      <div className="fixed inset-0 z-[60]" aria-hidden />
      <div aria-hidden className="tour-faro pointer-events-none fixed z-[61] rounded-xl"
        style={{ top: faro.top, left: faro.left, width: faro.width, height: faro.height, boxShadow: `0 0 0 200vmax rgb(13 27 42 / 0.62), 0 0 0 2px rgb(255 255 255 / ${faro.opacity * 0.9})` }} />

      {!inAttesa && (
        <div ref={scheda} role="dialog" aria-modal="true" aria-labelledby="tour-titolo" aria-describedby="tour-testo" key={passo.id}
          className={`tour-scheda fixed z-[62] max-h-[calc(100vh-24px)] overflow-y-auto rounded-card border border-line bg-surface-raised shadow-lift ${centro ? "p-5 md:p-8" : "p-4 md:p-5"}`} style={stileScheda}>
          {!benvenuto && (
            <div className="mb-2 flex items-center gap-3 md:mb-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin={1} aria-valuemax={tappe} aria-valuenow={i} aria-label={`Tappa ${i} di ${tappe}`}>
                <div className="tour-barra h-full rounded-full bg-brand" style={{ width: `${(i / tappe) * 100}%` }} />
              </div>
              <span className="shrink-0 text-xs font-medium text-ink-muted">{i} di {tappe}</span>
              <button type="button" onClick={rimanda} aria-label="Chiudi il tour: lo ritrovi nel menu Aiuto" title="Chiudi: lo ritrovi nel menu Aiuto"
                className="-mr-1.5 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface hover:text-ink [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">✕</button>
            </div>
          )}

          {benvenuto && (
            <div className="mb-4 flex items-center gap-3">
              <div className="brand-mark flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[22px] font-bold">F</div>
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">FleetDSP · primo accesso</span>
            </div>
          )}

          <h2 id="tour-titolo" ref={titolo} tabIndex={-1} className={`font-semibold tracking-tight outline-none ${benvenuto ? "text-[26px] leading-tight md:text-[30px]" : "text-[19px]"}`}>{passo.titolo}</h2>
          <div id="tour-testo" className={`mt-2 flex flex-col gap-2 text-ink ${benvenuto ? "text-[15px] leading-relaxed" : "text-sm leading-relaxed"}`}>
            {passo.testo.map((t) => <p key={t}>{t}</p>)}
            {passo.quando && <p className="rounded-control bg-surface px-3 py-1.5 text-[13px] md:py-2"><span className="font-semibold">Quando si usa: </span>{passo.quando}</p>}
          </div>

          {benvenuto && (
            <ul className="mt-3 grid gap-1 text-[13px] sm:mt-4 sm:grid-cols-3 sm:gap-2">
              {[["1", "La Home", "cosa c'è da fare oggi"], ["2", "Le sezioni", "cosa trovi e quando serve"], ["3", "L'aiuto", "come non sbagliare"]].map(([n, a, b]) => (
                <li key={n} className="flex items-center gap-2.5 rounded-control py-0.5 sm:flex-col sm:items-start sm:gap-1.5 sm:border sm:border-line sm:px-3 sm:py-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-light text-xs font-bold text-brand">{n}</span>
                  <span><span className="font-semibold sm:block">{a}</span><span className="text-ink-muted"><span className="sm:hidden">: </span>{b}</span></span>
                </li>
              ))}
            </ul>
          )}

          {passo.tipo === "dato" && (
            <div className="mt-3 rounded-control border border-line p-3">
              <div className="mb-2 flex items-center gap-2 text-sm">
                <span aria-hidden className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#c4ccd6] bg-surface-raised text-xs font-bold text-ink-muted">?</span>
                <span className="text-ink-muted">Dopo ogni azione il dato finisce in uno di questi posti:</span>
              </div>
              <ul className="flex flex-col gap-2 text-[13px]">
                {(Object.keys(DOVE) as Dove[]).map((k) => (
                  <li key={k} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                    <span className={`${TONO[DOVE[k].tono]} shrink-0 self-start`}><span className="badge-dot" aria-hidden />{DOVE[k].etichetta}</span>
                    <span className="text-ink-muted">{IN_BREVE[k]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {passo.tipo === "fine" && (
            <ol className="mt-3 flex flex-col gap-2 text-sm">
              {[
                { n: 1, testo: <>Apri la prima scheda in <b>Da fare</b> e premi <b>Vai</b>.</> },
                { n: 2, testo: <>Leggi <Link href="/vademecum/16-come-funziona-il-sito" className="font-semibold text-brand underline" onClick={() => segna("completato")}>Come funziona il sito</Link>: bastano 5 minuti.</> },
                { n: 3, testo: <>Cambia la password dal <Link href="/account" className="font-semibold text-brand underline" onClick={() => segna("completato")}>tuo account</Link>.</> },
              ].map((x) => (
                <li key={x.n} className="flex items-start gap-2.5 rounded-control border border-line px-3 py-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-light text-xs font-bold text-brand">{x.n}</span><span>{x.testo}</span>
                </li>
              ))}
              <li className="list-none text-[13px] text-ink-muted">Puoi rifare il tour quando vuoi: menu <b>Aiuto</b> → <b>Tour del sito</b>.</li>
            </ol>
          )}

          <div className={`flex flex-wrap items-center gap-2 ${benvenuto ? "mt-5 md:mt-6" : "mt-3 md:mt-4"}`}>
            {benvenuto ? (
              <>
                <button type="button" className="btn-primary" onClick={avanti}>Inizia il tour</button>
                <button type="button" className="btn-secondary" onClick={rimanda}>Più tardi</button>
                <button type="button" className="ml-auto min-h-[44px] px-1 text-[13px] text-ink-muted underline hover:text-ink" onClick={() => segna("saltato")}>Non mostrarlo più</button>
              </>
            ) : (
              <>
                <button type="button" className="btn-secondary" onClick={indietro}>Indietro</button>
                <button type="button" className="btn-primary ml-auto" onClick={avanti}>{ultimo ? "Ho finito" : "Avanti"}</button>
              </>
            )}
          </div>
          {benvenuto && <p className="mt-3 hidden text-xs text-ink-muted md:block">Con la tastiera: frecce per muoverti, Esc per rimandare.</p>}
        </div>
      )}
    </div>
  );
}
