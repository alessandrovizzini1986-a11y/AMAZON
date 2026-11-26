-- CreateTable
CREATE TABLE "PersonaleAddebito" (
    "id" TEXT NOT NULL,
    "mese" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "gruppo" TEXT NOT NULL,
    "codice" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "tipo" TEXT NOT NULL,
    "voce" TEXT NOT NULL,
    "importo" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PersonaleAddebito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonaleAddebito_mese_idx" ON "PersonaleAddebito"("mese");

-- CreateIndex
CREATE INDEX "PersonaleAddebito_station_mese_idx" ON "PersonaleAddebito"("station", "mese");

