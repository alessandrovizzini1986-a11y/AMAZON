import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";
import { TopNavLink, BottomNavLink } from "./NavLink";
import { NavIcon } from "./icons";
import { NAV_BY_ROLE, vociBarra } from "./navModel";
import { MenuMobile, AltroTablet } from "./MenuMobile";
import { MarcaScroll } from "./MarcaScroll";
import { GuardiaStagista } from "./GuardiaStagista";

const ROLE_LABEL: Record<SessionUser["role"], string> = {
  ADMIN: "Fleet Manager",
  RESP_MEZZI: "Responsabile Mezzi",
  DRIVER: "Driver",
  CONTROLLO: "Controllo presenze",
  STAGISTA: "Stagista",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U";
}

/**
 * Guscio dell'app: barra in alto (bianca, istituzionale) con le voci di menu,
 * su mobile header compatto + bottom nav. Le voci di gestione (solo admin)
 * stanno a destra, separate da quelle operative.
 */
export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const nav = NAV_BY_ROLE[user.role];
  const { barra, menu, conMenu } = vociBarra(user.role);
  // tablet: le prime 4 voci operative in vista, il resto in "Altro"
  const tabletVista = nav.main.slice(0, 4), tabletAltro = [...nav.main.slice(4), ...nav.admin];

  return (
    <div className="min-h-screen">
      {user.role === "STAGISTA" && <GuardiaStagista />}
      <header className="sticky top-0 z-20 border-b border-line bg-surface-raised print:hidden">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-6 px-4 md:h-[68px] md:gap-10 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="brand-mark flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[15px] font-bold md:h-9 md:w-9 md:text-[17px]">F</div>
            <div className="text-[17px] font-bold tracking-tight md:text-lg">FleetDSP</div>
          </Link>

          <nav className="hidden flex-1 items-center gap-1 min-[1800px]:flex" aria-label="Menu principale">
            {nav.main.map((item) => (
              <TopNavLink key={item.href} {...item} />
            ))}
            {nav.admin.length > 0 && <span aria-hidden className="mx-2 h-6 w-px bg-line" />}
            {nav.admin.map((item) => (
              <TopNavLink key={item.href} {...item} />
            ))}
          </nav>
          <nav className="hidden flex-1 items-center gap-1 xl:flex min-[1800px]:hidden" aria-label="Menu principale">
            {nav.main.map((item) => (
              <TopNavLink key={item.href} {...item} />
            ))}
            {nav.admin.length > 0 && <AltroTablet voci={nav.admin} etichetta="Gestione" />}
          </nav>
          <nav className="hidden flex-1 items-center gap-1 md:flex xl:hidden" aria-label="Menu principale">
            {tabletVista.map((item) => (
              <TopNavLink key={item.href} {...item} />
            ))}
            {tabletAltro.length > 0 && <AltroTablet voci={tabletAltro} />}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Link
              href="/account"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d5dbe3] text-xs font-semibold text-ink transition-colors hover:border-brand hover:text-brand md:h-10 md:w-10 md:text-sm"
              title={`${user.name} · ${ROLE_LABEL[user.role]}`}
              aria-label={`Account di ${user.name}`}
            >
              {initials(user.name)}
            </Link>
            <form action={logoutAction}>
              <button
                className="flex h-9 w-9 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                title="Esci"
                aria-label="Esci"
              >
                <NavIcon name="logout" className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 pb-24 pt-6 md:px-8 md:pb-16 md:pt-10 print:max-w-none print:p-0">{children}</main>

      <MarcaScroll />
      {/* bottom nav mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
        {barra.map((item) => (
          <BottomNavLink key={item.href} {...item} />
        ))}
        {conMenu && <MenuMobile voci={[...barra, ...menu]} inBarra={barra} utente={{ nome: user.name, ruolo: ROLE_LABEL[user.role] }} />}
      </nav>
    </div>
  );
}
