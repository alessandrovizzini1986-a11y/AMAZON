import type { StatoGiorno } from "@/domain/training/piano";
import type { Tipo } from "@/domain/training/tipi";

export const TIPO: Record<Tipo, { label: string; spiega: string; cls: string }> = {
  tell: { label: "Tell", spiega: "Alessandro spiega", cls: "badge-info" },
  show: { label: "Show", spiega: "Alessandro fa", cls: "badge-neutral" },
  do: { label: "Do", spiega: "la stagista fa", cls: "badge-ok" },
  check: { label: "Check", spiega: "verifica", cls: "badge-warn" },
};

export const STATO_GIORNO: Record<StatoGiorno, string> = { "da fare": "badge-neutral", "in corso": "badge-info", fatto: "badge-ok", validato: "badge-ok" };

export function Barra({ fatte, totali, ok = false, label }: { fatte: number; totali: number; ok?: boolean; label?: string }) {
  const pct = totali ? Math.round((fatte / totali) * 100) : 0;
  return (
    <div className={`tr-bar${ok ? " tr-ok" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={totali} aria-valuenow={fatte} aria-label={label ?? `${fatte} di ${totali}`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export const durataTesto = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60}′` : ""}` : `${min}′`);
