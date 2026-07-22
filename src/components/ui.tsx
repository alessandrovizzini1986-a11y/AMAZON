import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  action,
  backHref,
  backLabel = "Indietro",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  /** Se presente, mostra un link "← backLabel" sopra il titolo — serve soprattutto
   *  nelle pagine di dettaglio raggiunte da una riga di tabella, dove su mobile
   *  non c'è un modo ovvio per tornare all'elenco (la bottom nav non ha "indietro"). */
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        {backHref && (
          <Link href={backHref} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
            ← {backLabel}
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const KPI_ACCENT: Record<"neutral" | "ok" | "warn" | "danger", string> = {
  neutral: "bg-line",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
};

/**
 * KPI dive-deep: ogni numero è cliccabile e porta al dettaglio filtrato.
 * `source` dichiara da dove viene il dato (tabella/filtro/data) — tracciabilità.
 */
export function KpiCard({
  label,
  value,
  href,
  tone = "neutral",
  source,
}: {
  label: string;
  value: string | number;
  href: string;
  tone?: "neutral" | "ok" | "warn" | "danger";
  source: string;
}) {
  const toneClass = {
    neutral: "text-ink",
    ok: "text-ok",
    warn: "text-warn",
    danger: "text-danger",
  }[tone];
  return (
    <Link
      href={href}
      className="card group relative block overflow-hidden p-4 pl-5 transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-lift"
      title={`Fonte: ${source}`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${KPI_ACCENT[tone]}`} />
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums tracking-tight md:text-3xl ${toneClass}`}>{value}</div>
      <div className="mt-2 truncate text-[11px] text-ink-faint transition-colors group-hover:text-brand">
        {source} →
      </div>
    </Link>
  );
}

export function StatusBadge({ tone, children }: { tone: "ok" | "warn" | "danger" | "info" | "neutral"; children: React.ReactNode }) {
  const cls = {
    ok: "badge-ok",
    warn: "badge-warn",
    danger: "badge-danger",
    info: "badge-info",
    neutral: "badge-neutral",
  }[tone];
  return (
    <span className={cls}>
      <span aria-hidden className="badge-dot" />
      {children}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-12 text-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-8 w-8 text-ink-faint"
        aria-hidden="true"
      >
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
      <p className="max-w-md text-sm text-ink-muted">{message}</p>
    </div>
  );
}

/** Nota di tracciabilità sotto tabelle/grafici: fonte, filtro, data estrazione. */
export function SourceNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">Fonte dati: {children}</p>;
}
