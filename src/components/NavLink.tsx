"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon, type IconName } from "./icons";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Voce della barra in alto (desktop) con stato attivo a pill blu chiaro. */
export function TopNavLink({ href, label }: { href: string; label: string; icon?: IconName }) {
  const active = isActive(usePathname(), href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-control px-3.5 py-2.5 text-[15px] transition-colors ${
        active ? "bg-brand-light font-semibold text-brand" : "font-medium text-[#3c4a5c] hover:bg-surface hover:text-ink"
      }`}
    >
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
