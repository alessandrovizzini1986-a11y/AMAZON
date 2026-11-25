"use client";

import Link from "next/link";
import { abilitata } from "./testi";

/**
 * Link a un'altra pagina del sito che rispetta le voci di menu nascoste a quell'utente: se la pagina non si può aprire,
 * al posto del link c'è il testo e una nota, così nessuno finisce su una pagina che lo rimanda alla Home.
 */
export function LinkPagina({ href, nascosti, className = "font-medium underline", children }: { href: string; nascosti: readonly string[]; className?: string; children: React.ReactNode }) {
  if (abilitata(href, nascosti)) return <Link className={className} href={href}>{children}</Link>;
  return <span>{children} <span className="text-ink-muted">(pagina non abilitata per il tuo utente)</span></span>;
}
