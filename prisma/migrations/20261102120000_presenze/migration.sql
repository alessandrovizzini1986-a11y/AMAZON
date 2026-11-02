-- Modulo presenze: archivio file (solo metadati), esecuzioni e risultati dei controlli
CREATE TABLE "PresenzeFile" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "anno" INTEGER NOT NULL,
    "mese" INTEGER NOT NULL,
    "giorno" INTEGER NOT NULL DEFAULT 0,
    "nomeFile" TEXT NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "righe" INTEGER NOT NULL,
    "caricatoDaId" TEXT NOT NULL,
    "caricatoDa" TEXT NOT NULL,
    "caricatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PresenzeFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PresenzeRun" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "station" TEXT,
    "periodoDa" TIMESTAMP(3) NOT NULL,
    "periodoA" TIMESTAMP(3) NOT NULL,
    "eseguitoDaId" TEXT NOT NULL,
    "eseguitoDa" TEXT NOT NULL,
    "eseguitoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "riepilogoJson" JSONB NOT NULL,
    "nAlert" INTEGER NOT NULL,

    CONSTRAINT "PresenzeRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PresenzeRisultato" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "driver" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "giorni" JSONB NOT NULL,
    "oreTracking" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trasferte" INTEGER NOT NULL DEFAULT 0,
    "rotte" INTEGER NOT NULL DEFAULT 0,
    "nota" TEXT NOT NULL DEFAULT '',
    "esitoOps" TEXT NOT NULL DEFAULT 'aperto',
    "notaOps" TEXT,
    "aggiornatoIl" TIMESTAMP(3),

    CONSTRAINT "PresenzeRisultato_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PresenzeFile_tipo_hashSha256_station_anno_mese_giorno_key" ON "PresenzeFile"("tipo", "hashSha256", "station", "anno", "mese", "giorno");
CREATE INDEX "PresenzeFile_anno_mese_idx" ON "PresenzeFile"("anno", "mese");
CREATE INDEX "PresenzeRun_tipo_eseguitoIl_idx" ON "PresenzeRun"("tipo", "eseguitoIl");
CREATE INDEX "PresenzeRisultato_runId_idx" ON "PresenzeRisultato"("runId");

ALTER TABLE "PresenzeRisultato" ADD CONSTRAINT "PresenzeRisultato_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PresenzeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
