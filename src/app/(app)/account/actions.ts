"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireUser, hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";

export type ChangePasswordState = { error?: string; success?: string };

export async function changeMyPasswordAction(
  _prev: ChangePasswordState | undefined,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await requireUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword.length < 8) return { error: "La nuova password deve avere almeno 8 caratteri" };
  if (newPassword !== confirmPassword) return { error: "Le due password non coincidono" };

  const dbUser = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  const ok = await bcrypt.compare(currentPassword, dbUser.passwordHash);
  if (!ok) return { error: "Password attuale non corretta" };

  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  await audit({ userId: user.id, action: "user.changePassword", entity: "User", entityId: user.id });
  return { success: "Password aggiornata con successo" };
}
