/**
 * Uniforma retroattivamente marca/modello e compagnia di noleggio di tutti i
 * veicoli già presenti nel DB, usando la stessa normalizzazione applicata
 * d'ora in poi ad ogni import/inserimento manuale (src/domain/vehicleNames.ts).
 * Aggiorna solo le righe il cui valore normalizzato differisce da quello
 * attuale — nessun'altra colonna viene toccata.
 *
 * Uso: npx tsx scripts/normalize-vehicle-names.ts
 */
import { PrismaClient } from "@prisma/client";
import { normalizeModello, normalizeLeasingCompany, hasKnownBrand } from "../src/domain/vehicleNames";

const prisma = new PrismaClient();

async function main() {
  const vehicles = await prisma.vehicle.findMany({ select: { id: true, modello: true, leasingCompany: true } });
  console.log(`Veicoli totali: ${vehicles.length}`);

  let modelloAggiornati = 0;
  let leasingAggiornati = 0;
  const modelloInvariatiNonRiconosciuti = new Set<string>();

  for (const v of vehicles) {
    const nuovoModello = normalizeModello(v.modello);
    const nuovaCompany = normalizeLeasingCompany(v.leasingCompany);
    const data: { modello?: string; leasingCompany?: string | null } = {};

    if (nuovoModello !== v.modello) {
      data.modello = nuovoModello;
      modelloAggiornati++;
    } else if (!hasKnownBrand(v.modello) && v.modello !== "N/D" && !v.modello.startsWith("Veicolo storico")) {
      // segnalazione: marca non riconosciuta, lasciata invariata — utile per un controllo manuale
      modelloInvariatiNonRiconosciuti.add(v.modello);
    }
    if (nuovaCompany !== v.leasingCompany) {
      data.leasingCompany = nuovaCompany;
      leasingAggiornati++;
    }

    if (Object.keys(data).length > 0) {
      await prisma.vehicle.update({ where: { id: v.id }, data });
    }
  }

  console.log(`Modello normalizzato su ${modelloAggiornati} veicoli`);
  console.log(`Compagnia di noleggio normalizzata su ${leasingAggiornati} veicoli`);
  if (modelloInvariatiNonRiconosciuti.size) {
    console.log(`Valori lasciati invariati (marca non riconosciuta, verificare a mano):`, [...modelloInvariatiNonRiconosciuti].sort());
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
