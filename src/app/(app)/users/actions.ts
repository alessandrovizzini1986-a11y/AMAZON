"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, hashPassword } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const userSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  role: z.enum(["ADMIN", "RESP_MEZZI", "DRIVER", "CONTROLLO", "STAGISTA"]),
  stationId: z.string().optional(),
  licenseNo: z.string().optional(),
  phone: z.string().optional(),
});

export async function createUserAction(formData: FormData) {
  const admin = await requireUser();
  assertCan(admin, "users.manage");

  const raw = Object.fromEntries(formData.entries());
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) clean[k] = v === "" ? undefined : v;
  const data = userSchema.parse(clean);
  if ((data.role === "DRIVER" || data.role === "RESP_MEZZI") && !data.stationId) {
    redirect(`/users?error=${encodeURIComponent("Stazione obbligatoria per Driver e Responsabile Mezzi")}`);
  }

  const existing = await db.user.findUnique({ where: { email: data.email } });
  if (existing) redirect(`/users?error=${encodeURIComponent(`Email ${data.email} già registrata`)}`);

  const tempPassword = crypto.randomBytes(6).toString("base64url");
  const user = await db.user.create({
    data: { ...data, stationId: data.stationId ?? null, passwordHash: await hashPassword(tempPassword) },
  });
  await audit({ userId: admin.id, action: "user.create", entity: "User", entityId: user.id, meta: { email: data.email, role: data.role } });
  revalidatePath("/users");
  redirect(`/users?created=${encodeURIComponent(`${data.email} — password temporanea: ${tempPassword}`)}`);
}

export async function toggleUserActiveAction(userId: string) {
  const admin = await requireUser();
  assertCan(admin, "users.manage");
  if (userId === admin.id) throw new Error("Non puoi disattivare il tuo stesso account");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.user.update({ where: { id: userId }, data: { active: !user.active } });
  await audit({ userId: admin.id, action: user.active ? "user.deactivate" : "user.activate", entity: "User", entityId: userId, meta: { email: user.email } });
  revalidatePath("/users");
}

export async function resetUserPasswordAction(userId: string) {
  const admin = await requireUser();
  assertCan(admin, "users.manage");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const tempPassword = crypto.randomBytes(6).toString("base64url");
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(tempPassword) } });
  await audit({ userId: admin.id, action: "user.resetPassword", entity: "User", entityId: userId, meta: { email: user.email } });
  redirect(`/users?created=${encodeURIComponent(`${user.email} — nuova password temporanea: ${tempPassword}`)}`);
}

const ROLES = ["ADMIN", "RESP_MEZZI", "DRIVER", "CONTROLLO", "STAGISTA"] as const;

/** Cambia ruolo (e stazione) di un utente. Vale dal suo prossimo accesso. */
export async function changeUserRoleAction(userId: string, formData: FormData) {
  const admin = await requireUser();
  assertCan(admin, "users.manage");
  const role = z.enum(ROLES).parse(formData.get("role"));
  const stationId = (formData.get("stationId") as string) || null;
  if (userId === admin.id && role !== "ADMIN") redirect(`/users?error=${encodeURIComponent("Non puoi togliere il ruolo Admin al tuo stesso account")}`);
  if ((role === "DRIVER" || role === "RESP_MEZZI") && !stationId) redirect(`/users?error=${encodeURIComponent("Stazione obbligatoria per Driver e Responsabile Mezzi")}`);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.user.update({ where: { id: userId }, data: { role, stationId } });
  await audit({ userId: admin.id, action: "user.role", entity: "User", entityId: userId, meta: { email: user.email, da: user.role, a: role, stationId } });
  revalidatePath("/users");
  redirect(`/users?ok=${encodeURIComponent(`${user.email}: ruolo aggiornato. Vale dal prossimo accesso (deve uscire e rientrare).`)}`);
}

/** Imposta una password scelta dall'admin (la password non viene mai salvata in chiaro). */
export async function setUserPasswordAction(userId: string, formData: FormData) {
  const admin = await requireUser();
  assertCan(admin, "users.manage");
  const pw = String(formData.get("password") ?? "");
  if (pw.length < 8 || pw.length > 100) redirect(`/users?error=${encodeURIComponent("La password deve avere almeno 8 caratteri")}`);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(pw) } });
  await audit({ userId: admin.id, action: "user.setPassword", entity: "User", entityId: userId, meta: { email: user.email } });
  redirect(`/users?ok=${encodeURIComponent(`${user.email}: password impostata.`)}`);
}
