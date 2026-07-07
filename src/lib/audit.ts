import "server-only";
import { db } from "./db";
import type { Prisma } from "@prisma/client";

/**
 * Audit trail obbligatorio: ogni server action che muta dati chiama audit().
 * Non è opzionale — logica di controllo interno.
 */
export async function audit(params: {
  userId: string | null;
  action: string; // es. "fine.create", "replacement.send"
  entity: string;
  entityId?: string;
  meta?: Prisma.InputJsonValue; // before/after o payload sintetico
}) {
  await db.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      meta: params.meta,
    },
  });
}
