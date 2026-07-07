-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RESP_MEZZI', 'DRIVER');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ATTIVO', 'IN_OFFICINA', 'SOSTITUTIVO', 'DISMESSO');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('DIESEL', 'DIESEL_HVO', 'BENZINA', 'ELETTRICO', 'METANO', 'GPL', 'IBRIDO');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('TAGLIANDO', 'REVISIONE', 'RIPARAZIONE', 'GOMME', 'CARROZZERIA', 'ALTRO');

-- CreateEnum
CREATE TYPE "FineStatus" AS ENUM ('DA_NOTIFICARE', 'NOTIFICATA', 'PAGATA', 'RICORSO', 'ANNULLATA');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('NESSUNO', 'IN_PREPARAZIONE', 'PRESENTATO', 'ACCOLTO', 'RESPINTO');

-- CreateEnum
CREATE TYPE "ChargebackStatus" AS ENUM ('NON_PREVISTO', 'DA_ADDEBITARE', 'ADDEBITATO', 'CONTESTATO', 'SALDATO');

-- CreateEnum
CREATE TYPE "ReplacementReason" AS ENUM ('INCIDENTE', 'GUASTO', 'MANUTENZIONE');

-- CreateEnum
CREATE TYPE "PracticeStatus" AS ENUM ('APERTA', 'INVIATA', 'CONFERMATA', 'CONTESTATA', 'CHIUSA');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('RICHIESTO', 'APPROVATO', 'RIFIUTATO', 'COMPLETATO');

-- CreateEnum
CREATE TYPE "LiableParty" AS ENUM ('DRIVER', 'TERZI', 'IGNOTO');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('COMPLETATO', 'PARZIALE', 'FALLITO');

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "stationId" TEXT,
    "licenseNo" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "targa" TEXT NOT NULL,
    "modello" TEXT NOT NULL,
    "allestimento" TEXT,
    "alimentazione" "FuelType" NOT NULL,
    "hvoCompatibile" BOOLEAN NOT NULL DEFAULT false,
    "immatricolazione" TIMESTAMP(3) NOT NULL,
    "stationId" TEXT NOT NULL,
    "stato" "VehicleStatus" NOT NULL DEFAULT 'ATTIVO',
    "kmAttuali" INTEGER NOT NULL DEFAULT 0,
    "canoneGiorno" DECIMAL(10,2) NOT NULL,
    "leasingCompany" TEXT,
    "contrattoLeasingNo" TEXT,
    "prossimoTagliandoData" TIMESTAMP(3),
    "prossimoTagliandoKm" INTEGER,
    "prossimaRevisione" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleStationHistory" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "VehicleStationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRecord" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "tipo" "ServiceType" NOT NULL,
    "officina" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "kmIntervento" INTEGER NOT NULL,
    "costo" DECIMAL(10,2) NOT NULL,
    "descrizione" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fine" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "verbaleNo" TEXT,
    "dataOraInfrazione" TIMESTAMP(3) NOT NULL,
    "luogo" TEXT NOT NULL,
    "tipoViolazione" TEXT NOT NULL,
    "importo" DECIMAL(10,2) NOT NULL,
    "puntiPatente" INTEGER NOT NULL DEFAULT 0,
    "stato" "FineStatus" NOT NULL DEFAULT 'DA_NOTIFICARE',
    "dataNotifica" TIMESTAMP(3),
    "driverId" TEXT,
    "assegnazioneFonte" TEXT,
    "statoRicorso" "AppealStatus" NOT NULL DEFAULT 'NESSUNO',
    "scadenzaRicorso" TIMESTAMP(3),
    "noteRicorso" TEXT,
    "riaddebito" "ChargebackStatus" NOT NULL DEFAULT 'NON_PREVISTO',
    "importoRiaddebito" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkInKm" INTEGER,
    "checkInFoto" TEXT,
    "checkInNote" TEXT,
    "checkOutAt" TIMESTAMP(3),
    "checkOutKm" INTEGER,
    "checkOutFoto" TEXT,
    "checkOutNote" TEXT,
    "danniRilevati" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationTransfer" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "fromStationId" TEXT NOT NULL,
    "toStationId" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'RICHIESTO',
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "motivo" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "StationTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplacementCase" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "motivo" "ReplacementReason" NOT NULL,
    "dataIngressoOfficina" DATE NOT NULL,
    "centroConvenzionato" TEXT NOT NULL,
    "replacementVehicleId" TEXT,
    "dataRicezioneSostitutivo" DATE,
    "dataRientroOriginale" DATE,
    "stato" "PracticeStatus" NOT NULL DEFAULT 'APERTA',
    "inviataAt" TIMESTAMP(3),
    "canoneGiornoSnapshot" DECIMAL(10,2),
    "giorniScoperti" INTEGER,
    "importoStorno" DECIMAL(10,2),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplacementCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Damage" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "descrizione" TEXT,
    "fotoUrl" TEXT,
    "centroRiparazione" TEXT,
    "responsabilita" "LiableParty" NOT NULL DEFAULT 'IGNOTO',
    "reporterId" TEXT,
    "praticaAssicurativa" TEXT,
    "costoStimato" DECIMAL(10,2),
    "chiuso" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Damage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelCard" (
    "id" TEXT NOT NULL,
    "pan" TEXT NOT NULL,
    "vehicleId" TEXT,
    "attiva" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FuelCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelTransaction" (
    "id" TEXT NOT NULL,
    "fuelCardId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "litri" DECIMAL(10,2) NOT NULL,
    "importo" DECIMAL(10,2) NOT NULL,
    "puntoVendita" TEXT,
    "prodotto" TEXT,
    "importJobId" TEXT,

    CONSTRAINT "FuelTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TollTransaction" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "deviceCode" TEXT,
    "targa" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "tratta" TEXT,
    "importo" DECIMAL(10,2) NOT NULL,
    "importJobId" TEXT,

    CONSTRAINT "TollTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'string',
    "description" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "importedRows" INTEGER NOT NULL,
    "skippedRows" INTEGER NOT NULL,
    "errorLog" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Station_code_key" ON "Station"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "VehicleStationHistory_vehicleId_fromDate_idx" ON "VehicleStationHistory"("vehicleId", "fromDate");

-- CreateIndex
CREATE INDEX "ServiceRecord_vehicleId_data_idx" ON "ServiceRecord"("vehicleId", "data");

-- CreateIndex
CREATE INDEX "Fine_vehicleId_dataOraInfrazione_idx" ON "Fine"("vehicleId", "dataOraInfrazione");

-- CreateIndex
CREATE INDEX "Fine_driverId_idx" ON "Fine"("driverId");

-- CreateIndex
CREATE INDEX "Fine_stato_idx" ON "Fine"("stato");

-- CreateIndex
CREATE INDEX "Assignment_driverId_date_idx" ON "Assignment"("driverId", "date");

-- CreateIndex
CREATE INDEX "Assignment_stationId_date_idx" ON "Assignment"("stationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_vehicleId_date_key" ON "Assignment"("vehicleId", "date");

-- CreateIndex
CREATE INDEX "StationTransfer_vehicleId_idx" ON "StationTransfer"("vehicleId");

-- CreateIndex
CREATE INDEX "StationTransfer_status_idx" ON "StationTransfer"("status");

-- CreateIndex
CREATE INDEX "ReplacementCase_stato_idx" ON "ReplacementCase"("stato");

-- CreateIndex
CREATE UNIQUE INDEX "ReplacementCase_vehicleId_dataIngressoOfficina_key" ON "ReplacementCase"("vehicleId", "dataIngressoOfficina");

-- CreateIndex
CREATE INDEX "Damage_vehicleId_data_idx" ON "Damage"("vehicleId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "FuelCard_pan_key" ON "FuelCard"("pan");

-- CreateIndex
CREATE INDEX "FuelTransaction_fuelCardId_data_idx" ON "FuelTransaction"("fuelCardId", "data");

-- CreateIndex
CREATE INDEX "TollTransaction_stationId_data_idx" ON "TollTransaction"("stationId", "data");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_createdAt_idx" ON "ImportJob"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleStationHistory" ADD CONSTRAINT "VehicleStationHistory_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleStationHistory" ADD CONSTRAINT "VehicleStationHistory_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationTransfer" ADD CONSTRAINT "StationTransfer_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationTransfer" ADD CONSTRAINT "StationTransfer_fromStationId_fkey" FOREIGN KEY ("fromStationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationTransfer" ADD CONSTRAINT "StationTransfer_toStationId_fkey" FOREIGN KEY ("toStationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationTransfer" ADD CONSTRAINT "StationTransfer_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationTransfer" ADD CONSTRAINT "StationTransfer_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementCase" ADD CONSTRAINT "ReplacementCase_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementCase" ADD CONSTRAINT "ReplacementCase_replacementVehicleId_fkey" FOREIGN KEY ("replacementVehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Damage" ADD CONSTRAINT "Damage_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Damage" ADD CONSTRAINT "Damage_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelCard" ADD CONSTRAINT "FuelCard_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelTransaction" ADD CONSTRAINT "FuelTransaction_fuelCardId_fkey" FOREIGN KEY ("fuelCardId") REFERENCES "FuelCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelTransaction" ADD CONSTRAINT "FuelTransaction_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TollTransaction" ADD CONSTRAINT "TollTransaction_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TollTransaction" ADD CONSTRAINT "TollTransaction_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Vincolo di integrità: nessuna targa duplicata tra i veicoli non dismessi
CREATE UNIQUE INDEX "Vehicle_targa_active_key" ON "Vehicle"("targa") WHERE "stato" != 'DISMESSO';
