"use client";

import { useRouter } from "next/navigation";
import { COOKIE_MESE, etichettaMese, meseSpostato, mesiTra } from "@/lib/mesi";

/**
 * Selettore del mese unico per tutto il sito: ‹ Ottobre 2026 › con elenco dei mesi in italiano.
 * Il mese scelto si ricorda per la sessione del browser (cookie), così cambiando sezione resta lo stesso.
 * `href`: se c'è, il cambio porta a href?mese=AAAA-MM; altrimenti chiama onChange.
 */
export function SelettoreMese({ value, onChange, href, etichetta = "Mese", da = "2025-01", mesiAvanti = 2, ricorda = true }: {
  value: string; onChange?: (m: string) => void; href?: string; etichetta?: string; da?: string; mesiAvanti?: number; ricorda?: boolean;
}) {
  const router = useRouter();
  const oggi = new Date().toISOString().slice(0, 7);
  const a = meseSpostato(oggi, mesiAvanti);
  const mesi = mesiTra(da < value ? da : value, a > value ? a : value).reverse();
  const vai = (m: string) => {
    if (ricorda) { try { document.cookie = `${COOKIE_MESE}=${m}; path=/; SameSite=Lax`; } catch { /* ok */ } }
    if (onChange) onChange(m);
    if (href) router.push(`${href}${href.includes("?") ? "&" : "?"}mese=${m}`);
  };
  const prec = meseSpostato(value, -1), succ = meseSpostato(value, 1);
  const btn = "flex h-11 w-11 items-center justify-center rounded-control border border-line bg-surface-raised text-lg text-ink hover:border-brand disabled:opacity-40";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-ink-muted">{etichetta}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} onClick={() => vai(prec)} disabled={prec < (da < value ? da : value)} aria-label={`Mese prima: ${etichettaMese(prec)}`}>‹</button>
        <select className="input h-11 w-48" value={value} onChange={(e) => vai(e.target.value)} aria-label={etichetta}>
          {mesi.map((m) => <option key={m} value={m}>{etichettaMese(m)}</option>)}
        </select>
        <button type="button" className={btn} onClick={() => vai(succ)} disabled={succ > a} aria-label={`Mese dopo: ${etichettaMese(succ)}`}>›</button>
      </div>
    </div>
  );
}
