"use server";

import { redirect } from "next/navigation";
import { verifyCredentials, createSession, destroySession, getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function loginAction(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const user = await verifyCredentials(email, password);
  if (!user) {
    return { error: "Credenziali non valide" };
  }
  await createSession({
    id: user.id,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    role: user.role,
    stationId: user.stationId,
  });
  await audit({ userId: user.id, action: "auth.login", entity: "User", entityId: user.id });
  redirect("/");
}

export async function logoutAction() {
  const session = await getSession();
  if (session) {
    await audit({ userId: session.id, action: "auth.logout", entity: "User", entityId: session.id });
  }
  await destroySession();
  redirect("/login");
}
