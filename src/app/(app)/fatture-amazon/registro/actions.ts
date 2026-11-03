"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";

/** ADMIN: annulla l'esportazione di una fattura (torna "nuova" al prossimo caricamento del PDF). */
export async function annullaEsportazione(numero: string) {
  const user = await requireUser();
  assertCan(user, "fatture.annulla");
  const f = await db.amazonInvoice.findUniqueOrThrow({ where: { numero } });
  await db.amazonInvoice.update({ where: { numero }, data: { esportataIl: null, esportataDaId: null } });
  await audit({ userId: user.id, action: "fatture.annulla", entity: "AmazonInvoice", entityId: f.id, meta: { numero, esportataIl: f.esportataIl?.toISOString() ?? null } });
  revalidatePath("/fatture-amazon", "layout");
}
