-- CreateTable
CREATE TABLE "MogContratto" (
    "id" TEXT NOT NULL,
    "versione" TEXT NOT NULL,
    "cf" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "sito" TEXT NOT NULL,
    "station" TEXT,
    "dataInizio" DATE,
    "dataFine" DATE,
    "pctMog" DECIMAL(8,4),
    "oreMogMese" DECIMAL(10,2),
    "oreMogSett" DECIMAL(10,2),
    "giaConsolidato" TEXT,
    "rischioConsolidamento" TEXT,
    "mediaOreSemestre" DECIMAL(10,4),
    "ventiPctMog" DECIMAL(10,4),
    "meseProssimoConsolidamento" DATE,
    "caricatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caricatoDa" TEXT,

    CONSTRAINT "MogContratto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MogVariazione" (
    "id" TEXT NOT NULL,
    "cf" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "pctNuova" DECIMAL(8,4) NOT NULL,
    "validaDal" DATE NOT NULL,
    "fonte" TEXT,
    "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MogVariazione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MogEsito" (
    "id" TEXT NOT NULL,
    "mese" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "cf" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "oreLav" DECIMAL(10,2) NOT NULL,
    "oreAssRetrib" DECIMAL(10,2) NOT NULL,
    "computo" DECIMAL(10,2) NOT NULL,
    "oreMog" DECIMAL(10,2),
    "gap" DECIMAL(10,2),
    "stato" TEXT NOT NULL,
    "proiezioneFineMese" DECIMAL(10,2),
    "costoIntegrazione" DECIMAL(12,2) NOT NULL,
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MogEsito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MogContratto_station_idx" ON "MogContratto"("station");

-- CreateIndex
CREATE UNIQUE INDEX "MogContratto_versione_cf_key" ON "MogContratto"("versione", "cf");

-- CreateIndex
CREATE UNIQUE INDEX "MogVariazione_cf_validaDal_key" ON "MogVariazione"("cf", "validaDal");

-- CreateIndex
CREATE INDEX "MogEsito_mese_station_idx" ON "MogEsito"("mese", "station");

