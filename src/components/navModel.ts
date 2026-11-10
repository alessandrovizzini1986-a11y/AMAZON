/**
 * Menu a gruppi per tema (fonte unica per barra in alto, barra in basso e menu del telefono).
 * Le voci si filtrano con i permessi (src/lib/rbac.ts): ogni ruolo vede solo quello che può aprire.
 * Modulo condiviso server/client: nessuna dipendenza da server.
 */
import type { Role } from "@prisma/client";
import { can, type Action } from "@/lib/rbac";
import type { IconName } from "./icons";

export type NavItem = { href: string; label: string; short?: string; icon: IconName; descr?: string };
export type NavGroup = { id: string; label: string; icon: IconName; items: NavItem[] };

type Voce = NavItem & { perm: Action };
type Gruppo = { id: string; label: string; icon: IconName; voci: Voce[] };

export const GRUPPI: Gruppo[] = [
  { id: "home", label: "Home", icon: "home", voci: [{ href: "/home", label: "Da fare", icon: "home", perm: "home.view", descr: "scadenze della settimana e del mese" }, { href: "/conto-economico", label: "Conto economico", icon: "euro", perm: "costi.view", descr: "ricavi, costi e margine per cliente" }, { href: "/archivio", label: "Archivio file", icon: "import", perm: "home.view", descr: "i file trascinati, su questo PC" }] },
  {
    id: "flotta", label: "Flotta", icon: "fleet", voci: [
      { href: "/dashboard", label: "Situazione per stazione", icon: "dashboard", perm: "dashboard.station", descr: "furgoni e canoni per stazione" },
      { href: "/vehicles", label: "Mezzi", icon: "fleet", perm: "vehicle.view", descr: "dove si trova ogni targa" },
      { href: "/orders", label: "Furgoni in arrivo", icon: "orders", perm: "orders.view", descr: "ordini ai noleggiatori" },
      { href: "/officine", label: "Officine", icon: "wrench", perm: "officine.view", descr: "officine e carrozzerie autorizzate" },
      { href: "/vehicles/listini", label: "Listini noleggiatori", icon: "receipt", perm: "vehicle.manage", descr: "tariffe e confronto per classe" },
      { href: "/telefoni", label: "Telefoni e SIM", icon: "settings", perm: "telefoni.view", descr: "SIM e telefoni Wind, PIN e PUK" },
      { href: "/vehicles/aggiorna", label: "Aggiorna da Lista Targhe", icon: "import", perm: "import.run", descr: "targhe, contratti e canoni dal file" },
    ],
  },
  {
    id: "personale", label: "Personale", icon: "presenze", voci: [
      { href: "/presenze", label: "Presenze", icon: "presenze", perm: "presenze.view", descr: "tracking, controllo settimanale e fine mese" },
      { href: "/costi", label: "Costi del personale", icon: "euro", perm: "costi.view", descr: "stima a fine mese e consuntivo Amazon" },
      { href: "/costi/gls", label: "Costi GLS", icon: "euro", perm: "costi.view", descr: "appalto Castel Maggiore e Badgebox" },
    ],
  },
  {
    id: "amazon", label: "Amazon", icon: "receipt", voci: [
      { href: "/fatture-amazon", label: "Fatture", icon: "receipt", perm: "fatture.registro", descr: "importa i PDF e allinea fatt_2026" },
      { href: "/fatture-amazon/fatturato", label: "Fatturato", icon: "dashboard", perm: "fatturato.view", descr: "per mese, DS e classe" },
      { href: "/fatture-amazon/rimborsi", label: "Rimborsi", icon: "euro", perm: "fatturato.view", descr: "parcheggi, pedaggi, carburante, training" },
      { href: "/fatture-amazon/forecast", label: "Forecast", icon: "refresh", perm: "forecast.view", descr: "rotte previste e stima del mese" },
    ],
  },
  {
    id: "spese", label: "Spese mezzi", icon: "fuel", voci: [
      { href: "/carburante-telepass", label: "Telepass e carburante", icon: "fuel", perm: "telepass.view", descr: "stato del mese" },
      { href: "/carburante-telepass/telepass", label: "Telepass", icon: "fuel", perm: "telepass.run", descr: "elabora il file del mese" },
      { href: "/carburante-telepass/q8", label: "Carburante Q8", icon: "fuel", perm: "telepass.run", descr: "elabora l'export Q8" },
      { href: "/carburante-telepass/storico", label: "File già elaborati", icon: "import", perm: "telepass.run", descr: "mesi lavorati fuori dal sito" },
      { href: "/carburante-telepass/anagrafiche", label: "Carte e dispositivi", icon: "settings", perm: "telepass.view", descr: "anagrafiche Telepass e fuel card" },
    ],
  },
  {
    id: "aiuto", label: "Aiuto", icon: "book", voci: [
      { href: "/training", label: "Il mio training", icon: "book", perm: "training.view", descr: "percorso della stagista" },
      { href: "/vademecum", label: "Vademecum", icon: "book", perm: "vademecum.view", descr: "come si fa, passo per passo" },
      { href: "/vademecum/18-glossario", label: "Glossario", icon: "book", perm: "vademecum.view", descr: "sigle e parole del lavoro" },
      { href: "/training/admin", label: "Training (tutor)", icon: "users", perm: "training.admin", descr: "avanzamento e validazioni" },
      { href: "/portali", label: "Portali", icon: "settings", perm: "users.manage", descr: "accessi ai portali dei fornitori" },
    ],
  },
  {
    id: "gestione", label: "Gestione", icon: "settings", voci: [
      { href: "/import", label: "Import", icon: "import", perm: "import.run" },
      { href: "/users", label: "Utenti", icon: "users", perm: "users.manage" },
      { href: "/config", label: "Configurazione", icon: "settings", perm: "config.manage" },
      { href: "/audit", label: "Audit", icon: "audit", perm: "audit.viewFull" },
    ],
  },
];

/** Gruppi visibili per un ruolo (solo le voci permesse; i gruppi vuoti spariscono). L'admin non vede "Il mio training". */
export function menuPer(role: Role): NavGroup[] {
  return GRUPPI.map((g) => ({
    id: g.id, label: g.label, icon: g.icon,
    items: g.voci.filter((v) => can({ role }, v.perm) && !(v.href === "/training" && can({ role }, "training.admin"))).map(({ perm: _p, ...v }) => v),
  })).filter((g) => g.items.length > 0);
}

/** Tutte le voci visibili, in ordine. */
export const vociPer = (role: Role) => menuPer(role).flatMap((g) => g.items);

/** La voce attiva è quella con il percorso più lungo che combacia (/vehicles/listini → Listini, non Mezzi). */
export function voceAttiva(pathname: string, voci: NavItem[]): NavItem | null {
  let best: NavItem | null = null;
  for (const v of voci) if ((pathname === v.href || pathname.startsWith(`${v.href}/`)) && (!best || v.href.length > best.href.length)) best = v;
  return best;
}

export const vocePrincipale = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Gruppo attivo: quello che contiene la voce attiva. */
export function gruppoAttivo(pathname: string, gruppi: NavGroup[]): NavGroup | null {
  const v = voceAttiva(pathname, gruppi.flatMap((g) => g.items));
  return v ? gruppi.find((g) => g.items.includes(v)) ?? null : null;
}

/** Barra in basso (telefono): i primi 4 gruppi (Gestione esclusa) aprono la loro prima voce; tutto il resto è nel "Menu". */
export function vociBarra(role: Role, n = 4) {
  const gruppi = menuPer(role).filter((g) => g.id !== "gestione");
  const barra = gruppi.slice(0, n).map((g) => ({ ...g.items[0], label: g.label, short: g.label, icon: g.icon, gruppo: g.id }));
  const tutte = vociPer(role);
  const conMenu = tutte.length > barra.length;
  return { barra, conMenu };
}

/** Il pulsante "Menu" è attivo se la pagina corrente non è in un gruppo della barra. */
export function menuAttivo(pathname: string, role: Role, n = 4): boolean {
  const g = gruppoAttivo(pathname, menuPer(role));
  return !g || !vociBarra(role, n).barra.some((b) => b.gruppo === g.id);
}

/** Pagina iniziale del ruolo. */
export function paginaIniziale(role: Role): string {
  if (can({ role }, "home.view")) return "/home";
  if (can({ role }, "dashboard.station")) return "/dashboard";
  if (role === "STAGISTA") return "/training";
  return "/vehicles";
}
