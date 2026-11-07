import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";
import { BottomGruppoLink } from "./NavLink";
import { NavIcon } from "./icons";
import { menuPer, vociBarra } from "./navModel";
import { MenuMobile, GruppoMenu } from "./MenuMobile";
import { MenuAttivoBarra } from "./MenuAttivo";
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
 * Guscio dell'app: barra in alto con i gruppi del menu (tendine per tema), su telefono header compatto
 * + barra in basso con i primi 4 gruppi e "Menu". Gestione (solo admin) a destra, separata.
 */
export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const gruppi = menuPer(user.role);
  const operativi = gruppi.filter((g) => g.id !== "gestione"), gestione = gruppi.filter((g) => g.id === "gestione");
  const { barra } = vociBarra(user.role);
  const gruppiBarra = operativi.filter((g) => barra.some((b) => b.gruppo === g.id));
  // tablet: i primi 4 gruppi in vista, gli altri (e la gestione) in "Altro"
  const tabletVista = operativi.slice(0, 4), tabletAltro = [...operativi.slice(4), ...gestione];

  return (
    <div className="min-h-screen">
      {user.role === "STAGISTA" && <GuardiaStagista />}
      <header className="sticky top-0 z-20 border-b border-line bg-surface-raised print:hidden">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-6 px-4 md:h-[68px] md:gap-8 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="brand-mark flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[15px] font-bold md:h-9 md:w-9 md:text-[17px]">F</div>
            <div className="text-[17px] font-bold tracking-tight md:text-lg">FleetDSP</div>
          </Link>

          <nav className="hidden flex-1 items-center gap-1 xl:flex" aria-label="Menu principale">
            {operativi.map((g) => <GruppoMenu key={g.id} gruppi={[g]} etichetta={g.label} tutti={gruppi} />)}
            {gestione.length > 0 && <><span aria-hidden className="mx-2 h-6 w-px bg-line" /><GruppoMenu gruppi={gestione} etichetta="Gestione" tutti={gruppi} allineaDestra /></>}
          </nav>
          <nav className="hidden flex-1 items-center gap-1 md:flex xl:hidden" aria-label="Menu principale">
            {tabletVista.map((g) => <GruppoMenu key={g.id} gruppi={[g]} etichetta={g.label} tutti={gruppi} />)}
            {tabletAltro.length > 0 && <GruppoMenu gruppi={tabletAltro} etichetta="Altro" tutti={gruppi} allineaDestra />}
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
      {/* bottom nav mobile: i primi 4 gruppi + Menu con tutte le voci per gruppo */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
        {gruppiBarra.map((g) => <BottomGruppoLink key={g.id} gruppo={g} tutti={gruppi} />)}
        {gruppi.flatMap((g) => g.items).length > gruppiBarra.length && <MenuAttivoBarra gruppi={gruppi} inBarra={gruppiBarra.map((g) => g.id)} utente={{ nome: user.name, ruolo: ROLE_LABEL[user.role] }} />}
      </nav>
    </div>
  );
}
