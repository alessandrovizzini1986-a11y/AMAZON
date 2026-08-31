/**
 * Variante Neon di scripts/normalize-vehicle-names.ts — stessa logica di
 * normalizzazione (duplicata qui in JS puro, stessa fonte di verità concettuale
 * di src/domain/vehicleNames.ts), SQL parametrizzato via
 * @neondatabase/serverless invece di Prisma.
 *
 * Uso: node scripts/normalize-vehicle-names-neon.mjs --env-file .env
 */
import { neon } from "@neondatabase/serverless";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import fs from "node:fs";
import dotenv from "dotenv";
import { normalizeModello, normalizeLeasingCompany, hasKnownBrand } from "./lib/vehicleNames.mjs";

if (process.env.HTTPS_PROXY) setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));

const envFileIdx = process.argv.indexOf("--env-file");
const envVars = envFileIdx >= 0 ? dotenv.parse(fs.readFileSync(process.argv[envFileIdx + 1], "utf-8")) : process.env;
const sql = neon(envVars.NEON_URL || envVars.DATABASE_URL);

async function main() {
  const vehicles = await sql.query(`SELECT id, modello, "leasingCompany" FROM "Vehicle"`);
  console.log(`Veicoli totali: ${vehicles.length}`);

  let modelloAggiornati = 0;
  let leasingAggiornati = 0;
  const modelloInvariatiNonRiconosciuti = new Set();

  for (const v of vehicles) {
    const nuovoModello = normalizeModello(v.modello);
    const nuovaCompany = normalizeLeasingCompany(v.leasingCompany);
    const modelloChanged = nuovoModello !== v.modello;
    const leasingChanged = nuovaCompany !== v.leasingCompany;

    if (!modelloChanged && !hasKnownBrand(v.modello) && v.modello !== "N/D" && !v.modello.startsWith("Veicolo storico")) {
      modelloInvariatiNonRiconosciuti.add(v.modello);
    }
    if (modelloChanged) modelloAggiornati++;
    if (leasingChanged) leasingAggiornati++;

    if (modelloChanged || leasingChanged) {
      await sql.query(`UPDATE "Vehicle" SET modello=$1, "leasingCompany"=$2, "updatedAt"=now() WHERE id=$3`, [
        modelloChanged ? nuovoModello : v.modello,
        leasingChanged ? nuovaCompany : v.leasingCompany,
        v.id,
      ]);
    }
  }

  console.log(`Modello normalizzato su ${modelloAggiornati} veicoli`);
  console.log(`Compagnia di noleggio normalizzata su ${leasingAggiornati} veicoli`);
  if (modelloInvariatiNonRiconosciuti.size) {
    console.log(`Valori lasciati invariati (marca non riconosciuta, verificare a mano):`, [...modelloInvariatiNonRiconosciuti].sort());
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
