"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export type NavGroup = { category: string; pages: { href: string; title: string }[] };

/** Menu laterale (desktop) e select (mobile) delle pagine, con voce attiva evidenziata. */
export function VademecumNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <>
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted lg:hidden">
        Pagina
        <select className="input h-11 text-[15px] font-normal text-ink" value={pathname} onChange={(e) => router.push(e.target.value)}>
          {groups.map((g) => (
            <optgroup key={g.category} label={g.category}>
              {g.pages.map((p) => (
                <option key={p.href} value={p.href}>{p.title}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <nav aria-label="Pagine del vademecum" className="hidden flex-col gap-5 lg:flex">
        {groups.map((g) => (
          <div key={g.category}>
            <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{g.category}</div>
            <ul className="flex flex-col gap-0.5">
              {g.pages.map((p) => {
                const active = pathname === p.href;
                return (
                  <li key={p.href}>
                    <Link
                      href={p.href}
                      aria-current={active ? "page" : undefined}
                      className={`block rounded-control px-3 py-2 text-sm leading-snug transition-colors ${
                        active ? "bg-brand-light font-semibold text-brand" : "text-[#3c4a5c] hover:bg-surface-raised hover:text-ink"
                      }`}
                    >
                      {p.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
