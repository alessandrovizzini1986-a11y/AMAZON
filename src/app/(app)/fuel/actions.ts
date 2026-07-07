"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";

/** Associa/dissocia una fuel card (PAN) a un veicolo — la riconciliazione è per PAN, mai per targa. */
export async function assignFuelCardAction(cardId: string, formData: FormData) {
  const user = await requireUser();
  assertCan(user, "fuel.manage");

  const vehicleId = formData.get("vehicleId") ? String(formData.get("vehicleId")) : null;
  const card = await db.fuelCard.findUniqueOrThrow({ where: { id: cardId } });

  await db.fuelCard.update({
    where: { id: cardId },
    data: { vehicleId: vehicleId || null },
  });
  await audit({
    userId: user.id,
    action: "fuelcard.assign",
    entity: "FuelCard",
    entityId: cardId,
    meta: { pan: card.pan, before: card.vehicleId, after: vehicleId },
  });
  revalidatePath("/fuel");
}
