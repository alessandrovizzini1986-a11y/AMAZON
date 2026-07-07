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
