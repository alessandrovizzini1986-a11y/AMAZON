"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function updateConfigAction(key: string, formData: FormData) {
  const user = await requireUser();
  assertCan(user, "config.manage");

  const row = await db.appConfig.findUniqueOrThrow({ where: { key } });
  const value = String(formData.get("value") ?? "").trim();

  // validazione per tipo dichiarato
  if (row.type === "number" && Number.isNaN(Number(value))) {
    throw new Error(`"${value}" non è un numero valido`);
  }
  if (row.type === "number[]") {
    try {
      const arr = JSON.parse(value);
      if (!Array.isArray(arr) || arr.some((n) => typeof n !== "number")) throw new Error();
    } catch {
      throw new Error(`"${value}" non è un array di numeri valido (es. [30,15,7])`);
    }
  }

  await db.appConfig.update({ where: { key }, data: { value, updatedById: user.id } });
  await audit({
    userId: user.id,
    action: "config.update",
    entity: "AppConfig",
    entityId: key,
    meta: { before: row.value, after: value },
  });
  revalidatePath("/config");
}
