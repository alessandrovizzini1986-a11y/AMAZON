import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";

type NavItem = { href: string; label: string; icon: string };

// icone testuali provvisorie — DA SOSTITUIRE CON ASSET CANVA (design/brand/icon-*.svg)
const NAV_BY_ROLE: Record<SessionUser["role"], NavItem[]> = {
  DRIVER: [
    { href: "/driver", label: "Il mio mezzo", icon: "🚐" },
    { href: "/fines", label: "Le mie multe", icon: "🧾" },
    { href: "/damages/new", label: "Segnala danno", icon: "⚠️" },
  ],
  RESP_MEZZI: [
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/vehicles", label: "Flotta", icon: "🚐" },
    { href: "/maintenance", label: "Tagliandi", icon: "🔧" },
    { href: "/fines", label: "Multe", icon: "🧾" },
    { href: "/movements", label: "Movimentazione", icon: "🔁" },
    { href: "/replacements", label: "Sostitutivi", icon: "🔄" },
    { href: "/damages", label: "Danni", icon: "⚠️" },
    { href: "/fuel", label: "Fuel & Pedaggi", icon: "⛽" },
  ],
  ADMIN: [
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/vehicles", label: "Flotta", icon: "🚐" },
    { href: "/maintenance", label: "Tagliandi", icon: "🔧" },
    { href: "/fines", label: "Multe", icon: "🧾" },
    { href: "/movements", label: "Movimentazione", icon: "🔁" },
    { href: "/replacements", label: "Sostitutivi", icon: "🔄" },
    { href: "/damages", label: "Danni", icon: "⚠️" },
    { href: "/fuel", label: "Fuel & Pedaggi", icon: "⛽" },
    { href: "/import", label: "Import dati", icon: "📥" },
    { href: "/users", label: "Utenti", icon: "👥" },
    { href: "/config", label: "Configurazione", icon: "⚙️" },
    { href: "/audit", label: "Audit trail", icon: "🔍" },
  ],
};

const ROLE_LABEL: Record<SessionUser["role"], string> = {
  ADMIN: "Fleet Manager",
  RESP_MEZZI: "Responsabile Mezzi",
  DRIVER: "Driver",
};

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const nav = NAV_BY_ROLE[user.role];
  const isDriver = user.role === "DRIVER";

  return (
    <div className="min-h-screen md:flex">
      {/* sidebar desktop */}
      <aside className="hidden md:flex md:flex-col md:w-60 shrink-0 bg-brand-dark text-ink-inverse min-h-screen sticky top-0 max-h-screen">
        <div className="px-5 py-5 flex items-center gap-3 border-b border-white/10">
          <div className="h-9 w-9 rounded-control bg-white/15 flex items-center justify-center font-bold">F</div>
          <div>
            <div className="font-bold leading-tight">FleetDSP</div>
            <div className="text-xs opacity-70">{ROLE_LABEL[user.role]}</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-white/10 transition-colors"
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/10">
          <div className="text-sm font-medium truncate">{user.name}</div>
          <form action={logoutAction}>
            <button className="text-xs opacity-70 hover:opacity-100 underline mt-1">Esci</button>
          </form>
        </div>
      </aside>

      {/* header mobile */}
      <div className="md:hidden sticky top-0 z-20 bg-brand-dark text-ink-inverse px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold">
          <div className="h-7 w-7 rounded-control bg-white/15 flex items-center justify-center text-sm">F</div>
          FleetDSP
        </div>
        <form action={logoutAction}>
          <button className="text-xs underline opacity-80">Esci</button>
        </form>
      </div>

      <main className={`flex-1 min-w-0 p-4 md:p-8 ${isDriver ? "pb-24 md:pb-8" : ""}`}>{children}</main>

      {/* bottom nav mobile (stile consumer per driver e responsabile in cortile) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-surface-raised border-t border-line flex">
        {nav.slice(0, 4).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] text-ink-muted"
          >
            <span className="text-lg" aria-hidden>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
