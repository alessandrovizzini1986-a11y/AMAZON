import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";
import { SideNavLink, BottomNavLink } from "./NavLink";
import { NavIcon, type IconName } from "./icons";

type NavItem = { href: string; label: string; icon: IconName };
type NavSection = { title?: string; items: NavItem[] };

const OPERATIVO: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/vehicles", label: "Flotta", icon: "fleet" },
  { href: "/maintenance", label: "Tagliandi", icon: "wrench" },
  { href: "/fines", label: "Multe", icon: "receipt" },
  { href: "/movements", label: "Movimentazione", icon: "swap" },
  { href: "/replacements", label: "Sostitutivi", icon: "refresh" },
  { href: "/damages", label: "Danni", icon: "alert" },
  { href: "/fuel", label: "Fuel & Pedaggi", icon: "fuel" },
];

const NAV_BY_ROLE: Record<SessionUser["role"], NavSection[]> = {
  DRIVER: [
    {
      items: [
        { href: "/driver", label: "Il mio mezzo", icon: "fleet" },
        { href: "/fines", label: "Le mie multe", icon: "receipt" },
        { href: "/damages/new", label: "Segnala danno", icon: "alert" },
      ],
    },
  ],
  RESP_MEZZI: [{ items: OPERATIVO }],
  ADMIN: [
    { title: "Operativo", items: OPERATIVO },
    {
      title: "Gestione",
      items: [
        { href: "/import", label: "Import dati", icon: "import" },
        { href: "/users", label: "Utenti", icon: "users" },
        { href: "/config", label: "Configurazione", icon: "settings" },
        { href: "/audit", label: "Audit trail", icon: "audit" },
      ],
    },
  ],
};

const ROLE_LABEL: Record<SessionUser["role"], string> = {
  ADMIN: "Fleet Manager",
  RESP_MEZZI: "Responsabile Mezzi",
  DRIVER: "Driver",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U";
}

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const sections = NAV_BY_ROLE[user.role];
  const bottomNav = sections.flatMap((s) => s.items).slice(0, 4);

  return (
    <div className="min-h-screen md:flex">
      {/* sidebar desktop */}
      <aside className="sidebar-surface hidden shrink-0 text-white md:sticky md:top-0 md:flex md:max-h-screen md:min-h-screen md:w-64 md:flex-col">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="brand-mark flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold">F</div>
          <div>
            <div className="text-[15px] font-bold leading-tight tracking-tight">FleetDSP</div>
            <div className="text-xs text-slate-400">{ROLE_LABEL[user.role]}</div>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto pb-4 pt-1">
          {sections.map((section, i) => (
            <div key={i} className="space-y-0.5">
              {section.title && (
                <div className="px-6 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {section.title}
                </div>
              )}
              {section.items.map((item) => (
                <SideNavLink key={item.href} {...item} />
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/account"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-slate-100 transition-colors hover:bg-white/20"
              title="Il mio account"
            >
              {initials(user.name)}
            </Link>
            <div className="min-w-0 flex-1">
              <Link href="/account" className="block truncate text-sm font-medium text-slate-100 hover:underline">
                {user.name}
              </Link>
              <div className="truncate text-[11px] text-slate-400">{user.email}</div>
            </div>
            <form action={logoutAction}>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-control text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                title="Esci"
                aria-label="Esci"
              >
                <NavIcon name="logout" className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* header mobile */}
      <div className="sidebar-surface sticky top-0 z-20 flex items-center justify-between px-4 py-3 text-white md:hidden">
        <div className="flex items-center gap-2.5 font-bold tracking-tight">
          <div className="brand-mark flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold">F</div>
          FleetDSP
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/account"
            className="flex h-8 w-8 items-center justify-center rounded-control text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            title="Il mio account"
            aria-label="Il mio account"
          >
            <NavIcon name="user" className="h-4 w-4" />
          </Link>
          <form action={logoutAction}>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-control text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              title="Esci"
              aria-label="Esci"
            >
              <NavIcon name="logout" className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      <main className="min-w-0 flex-1 p-4 pb-24 md:p-8 md:pb-8">{children}</main>

      {/* bottom nav mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(15_23_42/0.06)] md:hidden">
        {bottomNav.map((item) => (
          <BottomNavLink key={item.href} {...item} />
        ))}
      </nav>
    </div>
  );
}
