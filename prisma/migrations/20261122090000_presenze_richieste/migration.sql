CREATE TABLE "PresenzeRichiesta" (
    "chiave" TEXT NOT NULL,
    "mese" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "pop" TEXT NOT NULL,
    "driver" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "rif" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "testo" TEXT NOT NULL,
    "stato" TEXT NOT NULL DEFAULT 'DA_FARE',
    "nota" TEXT,
    "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aggiornataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aggiornataDa" TEXT,
    CONSTRAINT "PresenzeRichiesta_pkey" PRIMARY KEY ("chiave")
);
CREATE INDEX "PresenzeRichiesta_mese_station_idx" ON "PresenzeRichiesta"("mese", "station");
