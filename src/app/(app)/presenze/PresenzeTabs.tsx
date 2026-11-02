"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/presenze/archivio", label: "1. Archivio file" },
  { href: "/presenze/settimanale", label: "2. Controllo settimanale" },
  { href: "/presenze/fine-mese", label: "3. Fine mese" },
];

export function PresenzeTabs() {
  const p = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-2 print:hidden" aria-label="Sezioni presenze">
      {TABS.map((t) => {
        const on = p.startsWith(t.href) || (t.href === "/presenze/settimanale" && p.startsWith("/presenze/esecuzioni"));
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-semibold transition-colors ${
              on ? "border-brand bg-brand text-white" : "border-[#d5dbe3] bg-surface-raised text-ink hover:border-brand hover:text-brand"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
