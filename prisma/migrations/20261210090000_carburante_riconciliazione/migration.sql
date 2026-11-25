CREATE TABLE "Q8Transazione" (
    "id" TEXT NOT NULL,
    "chiave" TEXT NOT NULL,
    "mese" TEXT NOT NULL,
    "giorno" TEXT NOT NULL,
    "ora" TEXT NOT NULL,
    "station" TEXT,
    "pan" TEXT NOT NULL,
    "identificativo" TEXT,
    "targaQ8" TEXT,
    "prodotto" TEXT,
    "litri" DOUBLE PRECISION NOT NULL,
    "importo" DOUBLE PRECISION NOT NULL,
    "importoNoIva" DOUBLE PRECISION NOT NULL,
    "impianto" TEXT,
    "indirizzo" TEXT,
    "citta" TEXT,
    "km" INTEGER,
    "caricatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Q8Transazione_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Q8Transazione_chiave_key" ON "Q8Transazione"("chiave");
CREATE INDEX "Q8Transazione_mese_idx" ON "Q8Transazione"("mese");
CREATE INDEX "Q8Transazione_station_giorno_idx" ON "Q8Transazione"("station", "giorno");

CREATE TABLE "CarburanteGiustifica" (
    "chiave" TEXT NOT NULL,
    "mese" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "nota" TEXT,
    "creatoDa" TEXT NOT NULL,
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CarburanteGiustifica_pkey" PRIMARY KEY ("chiave")
);
CREATE INDEX "CarburanteGiustifica_mese_idx" ON "CarburanteGiustifica"("mese");
