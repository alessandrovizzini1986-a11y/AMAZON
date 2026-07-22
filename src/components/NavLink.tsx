"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon, type IconName } from "./icons";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Voce della sidebar desktop con stato attivo evidenziato (barra d'accento + pill). */
export function SideNavLink({ href, label, icon }: { href: string; label: string; icon: IconName }) {
  const active = isActive(usePathname(), href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group relative mx-3 flex items-center gap-3 rounded-control px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-white/10 font-semibold text-white"
          : "text-slate-300/80 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span
        aria-hidden
        className={`absolute -left-3 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-sky-400 transition-opacity ${
          active ? "opacity-100" : "opacity-0"
        }`}
      />
      <NavIcon name={icon} className={`h-[18px] w-[18px] ${active ? "text-sky-300" : "text-slate-400 group-hover:text-slate-200"}`} />
      {label}
    </Link>
  );
}

/** Voce della bottom nav mobile con stato attivo colorato. */
export function BottomNavLink({ href, label, icon }: { href: string; label: string; icon: IconName }) {
  const active = isActive(usePathname(), href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors ${
        active ? "text-brand" : "text-ink-faint"
      }`}
    >
      <NavIcon name={icon} className="h-5 w-5" />
      {label}
    </Link>
  );
}
