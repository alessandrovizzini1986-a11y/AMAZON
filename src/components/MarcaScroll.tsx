"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Segna i riquadri scorrevoli (.overflow-x-auto) che hanno ancora contenuto a destra
 * (data-scorre="destra"): il CSS sfuma il bordo, così si capisce che la tabella continua.
 */
export function MarcaScroll() {
  const pathname = usePathname();
  useEffect(() => {
    const aggiorna = (el: Element) => {
      const e = el as HTMLElement;
      const resto = e.scrollWidth - e.clientWidth - e.scrollLeft;
      if (resto > 4) e.dataset.scorre = "destra"; else delete e.dataset.scorre;
    };
    const tutti = () => document.querySelectorAll(".overflow-x-auto").forEach(aggiorna);
    const onScroll = (ev: Event) => { const t = ev.target as Element; if (t instanceof HTMLElement && t.classList.contains("overflow-x-auto")) aggiorna(t); };
    tutti();
    const ro = new ResizeObserver(tutti);
    ro.observe(document.body);
    const mo = new MutationObserver(() => requestAnimationFrame(tutti));
    mo.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", tutti);
    return () => { ro.disconnect(); mo.disconnect(); document.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", tutti); };
  }, [pathname]);
  return null;
}
