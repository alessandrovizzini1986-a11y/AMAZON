/**
 * Crea (o riattiva) l'utente della stagista con ruolo STAGISTA e stampa la password iniziale una sola volta.
 * Uso: DATABASE_URL=... npx tsx scripts/crea-stagista.mts email@dominio Nome Cognome
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const [email, firstName, lastName] = process.argv.slice(2);
if (!email || !firstName || !lastName) { console.error("Uso: npx tsx scripts/crea-stagista.mts email Nome Cognome"); process.exit(1); }
const db = new PrismaClient();
const password = crypto.randomBytes(6).toString("base64url");
const passwordHash = await bcrypt.hash(password, 10);
const u = await db.user.upsert({
  where: { email: email.toLowerCase().trim() },
  create: { email: email.toLowerCase().trim(), firstName, lastName, role: "STAGISTA", passwordHash },
  update: { role: "STAGISTA", active: true, passwordHash },
});
console.log(`Utente ${u.email} (STAGISTA) pronto. Password iniziale: ${password} — comunicala in modo sicuro, al primo accesso va cambiata da "Il mio account".`);
await db.$disconnect();
