import type { Role } from "@prisma/client";
import type { SessionUser } from "./auth";

/**
 * Matrice permessi RBAC — fonte unica di verità.
 * Lo scoping per stazione (RESP_MEZZI vede solo la propria) è applicato
 * nelle query tramite stationScope(); qui si decide solo il "può fare".
 */
export type Action =
  | "vehicle.view"
  | "vehicle.manage"
  | "dashboard.station"
  | "dashboard.cluster"
  | "users.manage"
  | "config.manage"
  | "import.run"
  | "audit.viewFull"
  | "export.full"
  | "orders.view"
  | "vademecum.view"
  | "officine.view"
  | "presenze.view"
  | "presenze.run"
  | "presenze.config"
  | "telepass.view"
  | "telepass.run"
  | "telepass.anagrafiche"
  | "fatture.import"
  | "fatture.registro"
  | "fatture.allinea"
  | "fatture.storico"
  | "fatture.annulla"
  | "fatturato.view"
  | "forecast.import"
  | "forecast.view"
  | "costi.view"
  | "costi.run"
  | "costi.parametri"
  | "training.view"
  | "training.admin"
  | "home.view"
  | "telefoni.view"
  | "telefoni.manage"
  | "telefoni.codici";

const MATRIX: Record<Role, Action[]> = {
  DRIVER: [
    "vehicle.view",
  ],
  RESP_MEZZI: [
    "vehicle.view",
    "vehicle.manage",
    "dashboard.station",
    "vademecum.view",
    "officine.view",
    "fatturato.view", // solo la propria station (filtro nelle query)
  ],
  // stagista dei controlli: moduli Presenze e Telepass/carburante, vademecum
  CONTROLLO: [
    "home.view",
    "vademecum.view",
    "presenze.view",
    "presenze.run",
    "telepass.view",
    "telepass.run",
    "telepass.anagrafiche",
    "fatture.import",
    "fatture.registro",
    "costi.view",
    "costi.run",
    "costi.parametri",
  ],
  // stagista in training: solo il percorso e il vademecum
  STAGISTA: [
    "vademecum.view",
    "training.view",
  ],
  ADMIN: [
    "home.view",
    "vehicle.view",
    "vehicle.manage",
    "dashboard.station",
    "dashboard.cluster",
    "users.manage",
    "config.manage",
    "import.run",
    "audit.viewFull",
    "export.full",
    "orders.view",
    "vademecum.view",
    "officine.view",
    "presenze.view",
    "presenze.run",
    "presenze.config",
    "telepass.view",
    "telepass.run",
    "telepass.anagrafiche",
    "fatture.import",
    "fatture.registro",
    "fatture.allinea",
    "fatture.storico",
    "fatture.annulla",
    "fatturato.view",
    "forecast.import",
    "forecast.view",
    "costi.view",
    "costi.run",
    "costi.parametri",
    "training.view",
    "training.admin",
    "telefoni.view",
    "telefoni.manage",
    "telefoni.codici",
  ],
};

export function can(user: Pick<SessionUser, "role">, action: Action): boolean {
  return MATRIX[user.role].includes(action);
}

/** Lancia se l'utente non ha il permesso — da usare in testa a ogni server action. */
export function assertCan(user: Pick<SessionUser, "role">, action: Action) {
  if (!can(user, action)) {
    throw new Error(`Permesso negato: ${action} non consentito al ruolo ${user.role}`);
  }
}

/**
 * Filtro Prisma per lo scoping stazione.
 * ADMIN → nessun filtro (vista cluster); altri ruoli → solo propria stazione.
 */
export function stationScope(user: SessionUser): { stationId?: string } {
  if (user.role === "ADMIN") return {};
  if (!user.stationId) throw new Error("Utente senza stazione assegnata");
  return { stationId: user.stationId };
}
