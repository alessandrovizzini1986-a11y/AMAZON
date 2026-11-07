"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/carburante-telepass", label: "Stato del mese", exact: true },
  { href: "/carburante-telepass/anagrafiche", label: "Carte e dispositivi" },
  { href: "/carburante-telepass/telepass", label: "Telepass" },
  { href: "/carburante-telepass/q8", label: "Carburante Q8" },
  { href: "/carburante-telepass/storico", label: "File già elaborati" },
];

export function Tabs() {
  const p = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-2 print:hidden" aria-label="Sezioni Telepass e carburante">
      {TABS.map((t) => {
        const on = t.exact ? p === t.href : p.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
            className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-semibold transition-colors ${on ? "border-brand bg-brand text-white" : "border-[#d5dbe3] bg-surface-raised text-ink hover:border-brand hover:text-brand"}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
