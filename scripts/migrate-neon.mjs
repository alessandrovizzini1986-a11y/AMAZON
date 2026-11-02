/**
 * Applica su Neon (via HTTP) le migrazioni Prisma non ancora registrate in
 * _prisma_migrations, come farebbe "prisma migrate deploy" (che da qui non
 * raggiunge Neon in TCP). Uso: NEON_URL=... node scripts/migrate-neon.mjs [--dry-run]
 */
import { neon } from "@neondatabase/serverless";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

if (process.env.HTTPS_PROXY) setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));
if (!process.env.NEON_URL) throw new Error("NEON_URL mancante");
const sql = neon(process.env.NEON_URL);
const DRY = process.argv.includes("--dry-run");
const dir = path.join(process.cwd(), "prisma", "migrations");
const fatte = new Set((await sql.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`)).map((r) => r.migration_name));
const daFare = fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, "migration.sql")) && !fatte.has(d)).sort();
if (!daFare.length) console.log("Nessuna migrazione da applicare");
for (const name of daFare) {
  const body = fs.readFileSync(path.join(dir, name, "migration.sql"), "utf8");
  const stmts = body.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
  console.log(`${DRY ? "[dry-run] " : ""}${name}: ${stmts.length} istruzioni`);
  if (DRY) continue;
  for (const s of stmts) await sql.query(s);
  await sql.query(`INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count) VALUES ($1,$2,now(),$3,now(),1)`,
    [crypto.randomUUID(), crypto.createHash("sha256").update(body).digest("hex"), name]);
}
