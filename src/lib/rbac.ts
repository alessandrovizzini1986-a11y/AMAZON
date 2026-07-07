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
  | "damage.report"
  | "checkinout.perform"
  | "fine.viewOwn"
  | "fine.viewStation"
  | "fine.viewAll"
  | "fine.manage"
  | "maintenance.view"
  | "maintenance.manage"
  | "replacement.manage"
  | "transfer.request"
  | "transfer.approve"
  | "dashboard.station"
  | "dashboard.cluster"
  | "fuel.manage"
  | "users.manage"
  | "config.manage"
  | "import.run"
  | "audit.viewFull"
  | "export.full";

const MATRIX: Record<Role, Action[]> = {
  DRIVER: [
    "vehicle.view",
    "damage.report",
    "checkinout.perform",
    "fine.viewOwn",
    "maintenance.view",
  ],
  RESP_MEZZI: [
    "vehicle.view",
    "vehicle.manage",
    "damage.report",
    "checkinout.perform",
    "fine.viewOwn",
    "fine.viewStation",
    "fine.manage",
    "maintenance.view",
    "maintenance.manage",
    "replacement.manage",
    "transfer.request",
    "dashboard.station",
    "fuel.manage",
  ],
  ADMIN: [
    "vehicle.view",
    "vehicle.manage",
    "damage.report",
    "checkinout.perform",
    "fine.viewOwn",
    "fine.viewStation",
    "fine.viewAll",
    "fine.manage",
    "maintenance.view",
    "maintenance.manage",
    "replacement.manage",
    "transfer.request",
    "transfer.approve",
    "dashboard.station",
    "dashboard.cluster",
    "fuel.manage",
    "users.manage",
    "config.manage",
    "import.run",
    "audit.viewFull",
    "export.full",
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
