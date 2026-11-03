"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type Scheda = { href: string; label: string; exact?: boolean };

export function Tabs({ schede }: { schede: Scheda[] }) {
  const p = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-2 print:hidden" aria-label="Sezioni Fatture Amazon">
      {schede.map((t) => {
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
