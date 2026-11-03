/** Numero fattura normalizzato: maiuscolo, trim, refuso "NV-"/"V-" iniziale → "INV-" (il nome file non conta mai). */
export function normalizzaNumero(s: string | null | undefined): string {
  return String(s ?? "").trim().toUpperCase().replace(/^N?V-/, "INV-");
}

/** Progressivo finale del numero (INV-IT3JDBF-0002611 → 2611), o null. */
export function progressivo(numero: string): number | null {
  const m = /-(\d+)$/.exec(numero);
  return m ? Number(m[1]) : null;
}
