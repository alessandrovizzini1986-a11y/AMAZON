/**
 * Voci di menu per ruolo (fonte unica per barra in alto, barra in basso e menu mobile).
 * Modulo condiviso server/client: nessuna dipendenza da server.
 */
import type { Role } from "@prisma/client";
import type { IconName } from "./icons";

export type NavItem = { href: string; label: string; short?: string; icon: IconName };

const OPERATIVO: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/vehicles", label: "Flotta", icon: "fleet" },
  { href: "/vademecum", label: "Vademecum", icon: "book" },
  { href: "/officine", label: "Officine", icon: "wrench" },
];

const GESTIONE: NavItem[] = [
  { href: "/import", label: "Import", icon: "import" },
  { href: "/users", label: "Utenti", icon: "users" },
  { href: "/config", label: "Configurazione", icon: "settings" },
  { href: "/audit", label: "Audit", icon: "audit" },
];

export const NAV_BY_ROLE: Record<Role, { main: NavItem[]; admin: NavItem[] }> = {
  DRIVER: { main: [{ href: "/vehicles", label: "Flotta", icon: "fleet" }], admin: [] },
  RESP_MEZZI: { main: [...OPERATIVO, { href: "/fatture-amazon/fatturato", label: "Fatturato", icon: "receipt" }], admin: [] },
  CONTROLLO: {
    main: [
      { href: "/presenze", label: "Presenze", icon: "presenze" },
      { href: "/carburante-telepass", label: "Telepass e carburante", short: "Telepass", icon: "fuel" },
      { href: "/fatture-amazon", label: "Fatture Amazon", short: "Fatture", icon: "receipt" },
      { href: "/costi", label: "Costi del personale", short: "Costi", icon: "euro" },
      { href: "/vademecum", label: "Vademecum", icon: "book" },
    ],
    admin: [],
  },
  ADMIN: {
    main: [...OPERATIVO, { href: "/orders", label: "Ordini", icon: "orders" }, { href: "/presenze", label: "Presenze", icon: "presenze" }, { href: "/carburante-telepass", label: "Telepass e carburante", short: "Telepass", icon: "fuel" }, { href: "/fatture-amazon", label: "Fatture Amazon", short: "Fatture", icon: "receipt" }, { href: "/costi", label: "Costi del personale", short: "Costi", icon: "euro" }],
    admin: GESTIONE,
  },
};


export const vocePrincipale = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Barra in basso: le prime 4 voci; tutte le altre (e la gestione) vanno nel menu. */
export function vociBarra(role: Role, n = 4) {
  const nav = NAV_BY_ROLE[role];
  const tutte = [...nav.main, ...nav.admin];
  if (tutte.length <= n + 1) return { barra: tutte, menu: [] as NavItem[], conMenu: false };
  return { barra: nav.main.slice(0, n), menu: tutte.slice(n), conMenu: true };
}

/** Il menu "Menu"/"Altro" è attivo se la pagina corrente non è tra le voci in vista. */
export const menuAttivo = (pathname: string, inVista: NavItem[]) => !inVista.some((v) => vocePrincipale(pathname, v.href));
