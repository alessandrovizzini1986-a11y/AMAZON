import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "./db";
import type { Role } from "@prisma/client";

const COOKIE = "fleet_session";
const SESSION_HOURS = 12;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET non configurato (vedi .env.example)");
  return new TextEncoder().encode(s);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  stationId: string | null;
};

export async function createSession(user: SessionUser) {
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_HOURS * 3600,
    path: "/",
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/**
 * Modalità accesso libero per il pilot in solitaria: se AUTH_BYPASS=true,
 * salta completamente login/cookie e agisce sempre come l'utente indicato
 * da AUTH_BYPASS_EMAIL (default: l'admin del seed). Disattivata a livello di
 * codice quando NODE_ENV=production (vedi getSession sotto): anche se la
 * variabile resta impostata per errore, in produzione non ha alcun effetto.
 */
async function getBypassSession(): Promise<SessionUser | null> {
  const email = process.env.AUTH_BYPASS_EMAIL ?? "admin@fleetdsp.demo";
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    role: user.role,
    stationId: user.stationId,
  };
}

export async function getSession(): Promise<SessionUser | null> {
  if (process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production") return getBypassSession();

  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

/** Da usare nelle pagine/azioni protette: redirect a /login se non autenticato. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}

export async function verifyCredentials(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.active) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return user;
}

export { hashPassword } from "./password";
