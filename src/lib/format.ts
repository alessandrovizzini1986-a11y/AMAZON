/** Formattazione it-IT condivisa (client + server). */

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtEur(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v));
}

export function fmtKm(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${new Intl.NumberFormat("it-IT").format(v)} km`;
}

export function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: digits }).format(v);
}

/** Euro senza decimali (es. "285.721 €") — per KPI e grafici, dove i centesimi sono rumore. */
export function fmtEurInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  // separatore delle migliaia anche a 4 cifre ("2.355 €"): it-IT di default lo omette
  return `${String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} €`;
}
