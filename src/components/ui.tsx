import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-ink-muted mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

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
    <Link href={href} className="card p-4 block hover:border-brand transition-colors group" title={`Fonte: ${source}`}>
      <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{label}</div>
      <div className={`text-2xl md:text-3xl font-bold mt-1 ${toneClass}`}>{value}</div>
      <div className="text-[11px] text-ink-faint mt-2 truncate group-hover:text-brand">
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
  return <span className={cls}>{children}</span>;
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="card p-10 text-center text-ink-muted text-sm">{message}</div>
  );
}

/** Nota di tracciabilità sotto tabelle/grafici: fonte, filtro, data estrazione. */
export function SourceNote({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-ink-faint mt-2">Fonte dati: {children}</p>;
}
