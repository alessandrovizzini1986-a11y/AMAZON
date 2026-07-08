-- Aggiunge i campi necessari per il caricamento della flotta reale:
-- canone mensile (rinominato da canone/giorno), franchigia danni,
-- tipo contratto, date contratto, note operative, stato "Ufficio".

-- ALTER TYPE ... ADD VALUE non può stare nella stessa transazione di uso del valore,
-- va eseguito come statement a sé stante.
ALTER TYPE "VehicleStatus" ADD VALUE 'UFFICIO';

CREATE TYPE "ContractType" AS ENUM ('MT', 'LT', 'BT', 'SOST', 'UFFICIO');

-- immatricolazione: non tutti i veicoli reali hanno questa data separata dal contratto
ALTER TABLE "Vehicle" ALTER COLUMN "immatricolazione" DROP NOT NULL;

-- canone/giorno -> canone/mese: i contratti di leasing/noleggio italiani fatturano
-- un canone mensile, non giornaliero (vedi src/domain/replacement.ts)
ALTER TABLE "Vehicle" RENAME COLUMN "canoneGiorno" TO "canoneMese";
ALTER TABLE "Vehicle" ALTER COLUMN "canoneMese" DROP NOT NULL;

ALTER TABLE "Vehicle" ADD COLUMN "franchigiaDanni" DECIMAL(10,2);
ALTER TABLE "Vehicle" ADD COLUMN "tipoContratto" "ContractType";
ALTER TABLE "Vehicle" ADD COLUMN "contrattoDataInizio" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN "contrattoDataFine" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN "note" TEXT;

ALTER TABLE "ReplacementCase" RENAME COLUMN "canoneGiornoSnapshot" TO "canoneMeseSnapshot";
