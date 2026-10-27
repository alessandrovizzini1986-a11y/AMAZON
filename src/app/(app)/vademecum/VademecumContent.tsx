"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Shot = { src: string; alt: string };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Lightbox per le anteprime dei file Excel (testo piccolo): schermo intero,
 * zoom con pinch, rotellina+Ctrl, doppio tocco o pulsanti; si sposta trascinando.
 */
function Lightbox({ shot, onClose }: { shot: Shot; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);

  useEffect(() => {
    closeBtn.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setScale((s) => clamp(s * 1.25, 1, 6));
      if (e.key === "-") setScale((s) => clamp(s / 1.25, 1, 6));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={shot.alt} className="fixed inset-0 z-50 flex flex-col bg-[#0b1626] text-white">
      <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
        <p className="min-w-0 flex-1 truncate text-sm text-white/85">{shot.alt}</p>
        <button type="button" onClick={() => setScale((s) => clamp(s / 1.4, 1, 6))} className="h-10 w-10 rounded-control bg-white/10 text-lg font-bold hover:bg-white/20" aria-label="Riduci">−</button>
        <button type="button" onClick={() => setScale(1)} className="h-10 rounded-control bg-white/10 px-3 text-sm font-semibold hover:bg-white/20">Adatta</button>
        <button type="button" onClick={() => setScale((s) => clamp(s * 1.4, 1, 6))} className="h-10 w-10 rounded-control bg-white/10 text-lg font-bold hover:bg-white/20" aria-label="Ingrandisci">+</button>
        <button ref={closeBtn} type="button" onClick={onClose} className="h-10 w-10 rounded-control bg-white/10 text-xl hover:bg-white/20" aria-label="Chiudi">×</button>
      </div>
      <div
        ref={box}
        className="flex-1 overflow-auto overscroll-contain"
        style={{ touchAction: "pan-x pan-y" }}
        onWheel={(e) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          setScale((s) => clamp(s * (e.deltaY < 0 ? 1.1 : 0.9), 1, 6));
        }}
        onPointerDown={(e) => {
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2) pinch.current = { dist: dist(), scale };
        }}
        onPointerMove={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pinch.current && pointers.current.size === 2) setScale(clamp((pinch.current.scale * dist()) / pinch.current.dist, 1, 6));
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
        }}
        onDoubleClick={() => setScale((s) => (s > 1 ? 1 : 2.5))}
      >
        <div className="flex min-h-full items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shot.src}
            alt={shot.alt}
            draggable={false}
            className="mx-auto block h-auto max-w-none select-none bg-white"
            style={{ width: `${scale * 100}%` }}
          />
        </div>
      </div>
      <p className="px-4 py-2 text-center text-xs text-white/60">Pizzica o usa + / − per ingrandire · doppio tocco per zoom · Esc per chiudere</p>
    </div>
  );
}

/**
 * Contenuto di una pagina del vademecum (HTML già sanificato sul server) con i
 * comportamenti lato browser: lightbox sulle immagini, pulsante "Copia" sui
 * template mail (citazioni), ombre sui bordi delle tabelle che scorrono.
 */
export function VademecumContent({ html, className = "" }: { html: string; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const close = useCallback(() => setShot(null), []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const cleanups: (() => void)[] = [];

    // immagini → lightbox
    for (const img of el.querySelectorAll<HTMLImageElement>(".vd-figure img")) {
      img.tabIndex = 0;
      img.setAttribute("role", "button");
      img.setAttribute("aria-label", `Ingrandisci: ${img.alt}`);
      const open = () => setShot({ src: img.currentSrc || img.src, alt: img.alt });
      const onKey = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
      img.addEventListener("click", open);
      img.addEventListener("keydown", onKey);
      cleanups.push(() => { img.removeEventListener("click", open); img.removeEventListener("keydown", onKey); });
    }

    // template mail → pulsante Copia
    for (const bq of el.querySelectorAll<HTMLQuoteElement>("blockquote")) {
      if (bq.querySelector(":scope > .vd-copy")) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vd-copy";
      btn.textContent = "Copia";
      btn.setAttribute("aria-label", "Copia il testo del template");
      const onClick = async () => {
        const clone = bq.cloneNode(true) as HTMLElement;
        clone.querySelector(".vd-copy")?.remove();
        const text = clone.innerText.replace(/\n{3,}/g, "\n\n").trim();
        let ok = false;
        try {
          await navigator.clipboard.writeText(text);
          ok = true;
        } catch {
          // fallback per browser senza API clipboard
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          ok = document.execCommand("copy");
          ta.remove();
        }
        btn.textContent = ok ? "Copiato ✓" : "Non copiato";
        window.setTimeout(() => { btn.textContent = "Copia"; }, 2000);
      };
      btn.addEventListener("click", onClick);
      bq.prepend(btn);
      cleanups.push(() => { btn.removeEventListener("click", onClick); btn.remove(); });
    }

    // tabelle che scorrono → ombra sul lato dove c'è altro contenuto
    for (const wrap of el.querySelectorAll<HTMLElement>(".vd-table-wrap")) {
      const scroller = wrap.querySelector<HTMLElement>(".vd-table");
      if (!scroller) continue;
      const update = () => {
        const max = scroller.scrollWidth - scroller.clientWidth;
        wrap.toggleAttribute("data-left", scroller.scrollLeft > 2);
        wrap.toggleAttribute("data-right", max - scroller.scrollLeft > 2);
      };
      update();
      scroller.addEventListener("scroll", update, { passive: true });
      const ro = new ResizeObserver(update);
      ro.observe(scroller);
      cleanups.push(() => { scroller.removeEventListener("scroll", update); ro.disconnect(); });
    }

    return () => cleanups.forEach((fn) => fn());
  }, [html]);

  return (
    <>
      <div ref={root} className={`vd-prose ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
      {shot && <Lightbox shot={shot} onClose={close} />}
    </>
  );
}

/** Registra il service worker della sezione: pagine e immagini già viste restano disponibili offline. */
export function VademecumOffline() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/vademecum/sw.js", { scope: "/vademecum" }).catch(() => {
      /* offline non disponibile: la sezione funziona comunque online */
    });
  }, []);
  return null;
}
