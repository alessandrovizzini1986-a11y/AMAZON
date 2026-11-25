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
  {
    id: "home", label: "Home", icon: "home", voci: [
      { href: "/home", label: "Da fare", icon: "home", perm: "home.view", descr: "scadenze della settimana e del mese" },
      { href: "/conto-economico", label: "Conto economico", icon: "euro", perm: "costi.view", descr: "ricavi, costi e margine per cliente" },
    ],
  },
  {
    id: "flotta", label: "Flotta", icon: "fleet", voci: [
      { href: "/dashboard", label: "Situazione per stazione", icon: "dashboard", perm: "dashboard.station", descr: "furgoni e canoni per stazione" },
      { href: "/vehicles", label: "Mezzi", icon: "fleet", perm: "vehicle.view", descr: "dove si trova ogni targa" },
      { href: "/vehicles/aggiorna", label: "Aggiorna da Lista Targhe", icon: "import", perm: "import.run", descr: "attivi, cessati e canoni dal file" },
      { href: "/orders", label: "Furgoni in arrivo", icon: "orders", perm: "orders.view", descr: "ordini ai noleggiatori" },
      { href: "/vehicles/listini", label: "Listini noleggiatori", icon: "receipt", perm: "vehicle.manage", descr: "tariffe e confronto per classe" },
      { href: "/officine", label: "Officine", icon: "wrench", perm: "officine.view", descr: "officine e carrozzerie autorizzate" },
    ],
  },
  {
    id: "personale", label: "Personale", icon: "presenze", voci: [
      { href: "/presenze", label: "Presenze", icon: "presenze", perm: "presenze.view", descr: "tracking, controllo settimanale e fine mese" },
      { href: "/costi", label: "Costi del personale", icon: "euro", perm: "costi.view", descr: "stima a fine mese e consuntivo Amazon" },
      { href: "/costi/gls", label: "Costi GLS", icon: "euro", perm: "costi.view", descr: "appalto Castel Maggiore e Badgebox" },
      { href: "/personale-assenze", label: "Assenze e infortuni", icon: "dashboard", perm: "users.manage", descr: "malattia e infortuni di SIC e STD: dove intervenire" },
    ],
  },
  {
    id: "amazon", label: "Amazon", icon: "receipt", voci: [
      { href: "/fatture-amazon", label: "Fatture", icon: "receipt", perm: "fatture.registro", descr: "importa i PDF e allinea fatt_2026" },
      { href: "/fatture-amazon/fatturato", label: "Fatturato", icon: "dashboard", perm: "fatturato.view", descr: "per mese, DS e classe" },
      { href: "/fatture-amazon/rimborsi", label: "Rimborsi", icon: "euro", perm: "fatturato.view", descr: "parcheggi, pedaggi, carburante, training" },
      { href: "/fatture-amazon/forecast", label: "Forecast", icon: "refresh", perm: "forecast.view", descr: "carica i file, rotte previste e stima del mese" },
      { href: "/fatture-amazon/forecast/storico", label: "Storico forecast", icon: "dashboard", perm: "forecast.view", descr: "come cambia, rotta massima, furgoni che servono" },
    ],
  },
  {
    id: "spese", label: "Spese mezzi", icon: "fuel", voci: [
      { href: "/carburante-telepass", label: "Stato del mese", icon: "fuel", perm: "telepass.view", descr: "cosa manca per Telepass e carburante" },
      { href: "/carburante-telepass/telepass", label: "Telepass", icon: "fuel", perm: "telepass.run", descr: "elabora il file del mese" },
      { href: "/carburante-telepass/q8", label: "Carburante Q8", icon: "fuel", perm: "telepass.run", descr: "elabora l'export Q8" },
      { href: "/carburante-telepass/storico", label: "File già elaborati", icon: "import", perm: "telepass.run", descr: "mesi lavorati fuori dal sito" },
    ],
  },
  {
    // cose che si consultano o si usano al bisogno, non lavori del mese
    id: "strumenti", label: "Strumenti", icon: "wrench", voci: [
      { href: "/telefoni", label: "Telefoni e SIM", icon: "settings", perm: "telefoni.view", descr: "a chi sono assegnati, PIN e PUK" },
      { href: "/carburante-telepass/anagrafiche", label: "Fuel card e Telepass", icon: "fuel", perm: "telepass.view", descr: "station, targa e PIN di ogni carta" },
      { href: "/spedizioni-gls", label: "Spedizioni GLS", icon: "orders", perm: "spedizioni.view", descr: "portale GLS e bollettino in PDF" },
      { href: "/telematica/mappa", label: "Mappa dei furgoni", icon: "settings", perm: "users.manage", descr: "dove sono adesso i mezzi" },
      { href: "/telematica/giornata", label: "Giornata di consegna", icon: "settings", perm: "users.manage", descr: "cosa ha fatto ogni furgone in un giorno" },
      { href: "/telematica/mese", label: "Furgoni: il mese", icon: "settings", perm: "users.manage", descr: "km, ore, soste e rifornimenti per targa" },
      { href: "/telematica/carburante", label: "Carburante: Q8 e telematica", icon: "settings", perm: "users.manage", descr: "pagamenti Q8 contro rifornimenti visti dai furgoni" },
      { href: "/telematica", label: "Telematica furgoni", icon: "settings", perm: "users.manage", descr: "collegamento a Targa e FlottaWeb" },
      { href: "/portali", label: "Portali fornitori", icon: "settings", perm: "users.manage", descr: "indirizzi e accessi di noleggiatori, Telepass, Q8" },
      { href: "/archivio", label: "Archivio file", icon: "import", perm: "home.view", descr: "i file trascinati, su questo PC" },
    ],
  },
  {
    id: "aiuto", label: "Aiuto", icon: "book", voci: [
      { href: "/training", label: "Il mio training", icon: "book", perm: "training.view", descr: "percorso della stagista" },
      { href: "/corsi", label: "Corsi", icon: "book", perm: "vademecum.view", descr: "lezioni ed esercizi, una regola alla volta" },
      { href: "/vademecum", label: "Vademecum", icon: "book", perm: "vademecum.view", descr: "come si fa, passo per passo" },
      { href: "/vademecum/18-glossario", label: "Glossario", icon: "book", perm: "vademecum.view", descr: "sigle e parole del lavoro" },
      { href: "/home?tour=1", label: "Tour del sito", icon: "refresh", perm: "home.view", descr: "il giro guidato, da rifare quando vuoi" },
      { href: "/training/admin", label: "Training (tutor)", icon: "users", perm: "training.admin", descr: "avanzamento e validazioni" },
    ],
  },
  {
    id: "gestione", label: "Gestione", icon: "settings", voci: [
      { href: "/users", label: "Utenti", icon: "users", perm: "users.manage", descr: "chi entra, con che ruolo e password" },
      { href: "/uso", label: "Uso del sito", icon: "dashboard", perm: "users.manage", descr: "quali pagine si usano davvero, e quali no" },
      { href: "/audit", label: "Registro attività", icon: "audit", perm: "audit.viewFull", descr: "chi ha fatto cosa, e quando" },
      { href: "/config", label: "Configurazione", icon: "settings", perm: "config.manage", descr: "impostazioni del sito" },
      { href: "/import", label: "Import iniziale", icon: "import", perm: "import.run", descr: "caricamenti massivi da Excel, di rado" },
    ],
  },
];

/**
 * Gruppi visibili per un ruolo (solo le voci permesse; i gruppi vuoti spariscono). L'admin non vede "Il mio training".
 * `nascosti` = voci che il super admin ha tolto a quell'utente (href): spariscono dal menu e non si aprono (vedi `bloccato`).
 */
export function menuPer(role: Role, nascosti: string[] = []): NavGroup[] {
  return GRUPPI.map((g) => ({
    id: g.id, label: g.label, icon: g.icon,
    items: g.voci.filter((v) => can({ role }, v.perm) && !nascosti.includes(v.href) && !(v.href === "/training" && can({ role }, "training.admin"))).map(({ perm: _p, ...v }) => v),
  })).filter((g) => g.items.length > 0);
}

/** Tutte le voci visibili, in ordine. */
export const vociPer = (role: Role, nascosti: string[] = []) => menuPer(role, nascosti).flatMap((g) => g.items);

const TUTTI_GLI_HREF = GRUPPI.flatMap((g) => g.voci.map((v) => v.href)).filter((h) => !h.includes("?"));

/** Voci riservate al super admin: agli altri non compaiono mai e non si aprono (requireUser le aggiunge alle nascoste). */
export const SOLO_SUPER = ["/uso", "/personale-assenze"];

/** Le voci che un ruolo potrebbe vedere, per gruppo: è l'elenco dei flag che il super admin accende o spegne. */
export const vociDelRuolo = (role: Role) => menuPer(role, SOLO_SUPER);

/**
 * A quale voce di menu appartiene una pagina (quella con il percorso più lungo che combacia): è l'unità della statistica d'uso.
 * Le pagine fuori menu finiscono sotto "altro:/primo-pezzo".
 */
export function voceDi(pathname: string): string {
  const p = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  let voce: string | null = null;
  for (const h of TUTTI_GLI_HREF) if ((p === h || p.startsWith(`${h}/`)) && (!voce || h.length > voce.length)) voce = h;
  return voce ?? `altro:/${p.split("/")[1] ?? ""}`;
}

/** Tutte le voci del menu con gruppo ed etichetta, per la tabella della statistica (anche quelle mai aperte). */
export const tutteLeVoci = () => GRUPPI.flatMap((g) => g.voci.filter((v) => !v.href.includes("?")).map((v) => ({ href: v.href, label: v.label, gruppo: g.label })));

/**
 * Una pagina (o una sua chiamata /api/…) è bloccata se la voce di menu a cui appartiene è tra le nascoste.
 * Vale la voce con il percorso più lungo: nascondere "Costi del personale" non nasconde "Costi GLS".
 */
export function bloccato(pathname: string, nascosti: string[]): boolean {
  if (!nascosti.length) return false;
  const p = pathname.startsWith("/api/") ? pathname.slice(4) : pathname;
  let voce: string | null = null;
  for (const h of TUTTI_GLI_HREF) if ((p === h || p.startsWith(`${h}/`)) && (!voce || h.length > voce.length)) voce = h;
  return !!voce && nascosti.includes(voce);
}

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
export function vociBarra(role: Role, n = 4, nascosti: string[] = []) {
  const gruppi = menuPer(role, nascosti).filter((g) => g.id !== "gestione");
  const barra = gruppi.slice(0, n).map((g) => ({ ...g.items[0], label: g.label, short: g.label, icon: g.icon, gruppo: g.id }));
  const tutte = vociPer(role, nascosti);
  const conMenu = tutte.length > barra.length;
  return { barra, conMenu };
}

/** Il pulsante "Menu" è attivo se la pagina corrente non è in un gruppo della barra. */
export function menuAttivo(pathname: string, role: Role, n = 4): boolean {
  const g = gruppoAttivo(pathname, menuPer(role));
  return !g || !vociBarra(role, n).barra.some((b) => b.gruppo === g.id);
}

/** Pagina iniziale del ruolo. */
export function paginaIniziale(role: Role, nascosti: string[] = []): string {
  const candidate = [can({ role }, "home.view") ? "/home" : null, can({ role }, "dashboard.station") ? "/dashboard" : null, role === "STAGISTA" ? "/training" : null, "/vehicles"];
  // se anche la pagina iniziale è stata nascosta, si atterra sul proprio account (che non si può nascondere)
  return candidate.find((h): h is string => !!h && !nascosti.includes(h)) ?? "/account";
}
