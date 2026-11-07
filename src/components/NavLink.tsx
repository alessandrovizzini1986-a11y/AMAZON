"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon, type IconName } from "./icons";
import { gruppoAttivo, type NavGroup } from "./navModel";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Voce della barra in alto (desktop) con stato attivo a pill blu chiaro. */
export function TopNavLink({ href, label, short }: { href: string; label: string; short?: string; icon?: IconName }) {
  const active = isActive(usePathname(), href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={short ? label : undefined}
      className={`whitespace-nowrap rounded-control px-2.5 py-2.5 text-[15px] transition-colors ${
        active ? "bg-brand-light font-semibold text-brand" : "font-medium text-[#3c4a5c] hover:bg-surface hover:text-ink"
      }`}
    >
      {short ?? label}
    </Link>
  );
}

/** Voce della bottom nav mobile con stato attivo colorato. */
export function BottomNavLink({ href, label, short, icon }: { href: string; label: string; short?: string; icon: IconName }) {
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
      {short ?? label}
    </Link>
  );
}

/** Voce della barra in basso per un gruppo: apre la prima voce del gruppo, è attiva su tutte le sue pagine. */
export function BottomGruppoLink({ gruppo, tutti }: { gruppo: NavGroup; tutti: NavGroup[] }) {
  const active = gruppoAttivo(usePathname(), tutti)?.id === gruppo.id;
  return (
    <Link href={gruppo.items[0].href} aria-current={active ? "page" : undefined}
      className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors ${active ? "text-brand" : "text-ink-faint"}`}>
      <NavIcon name={gruppo.icon} className="h-5 w-5" />
      {gruppo.label}
    </Link>
  );
}
