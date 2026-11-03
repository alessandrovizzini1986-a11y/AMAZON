-- CreateTable
CREATE TABLE "TelepassDispositivo" (
    "codice" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "targa" TEXT,
    "progetto" TEXT,
    "check" TEXT,
    "note" TEXT,
    "nonPiuInFile" BOOLEAN NOT NULL DEFAULT false,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL,
    "aggiornatoDa" TEXT,

    CONSTRAINT "TelepassDispositivo_pkey" PRIMARY KEY ("codice")
);

-- CreateTable
CREATE TABLE "CartaCarburante" (
    "pan" TEXT NOT NULL,
    "numeroCarta" TEXT,
    "identificativo" TEXT,
    "targa" TEXT,
    "bloccata" TEXT,
    "dataBlocco" TIMESTAMP(3),
    "centroCosto" TEXT,
    "appalto" TEXT,
    "ds" TEXT,
    "note" TEXT,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "nonPiuInFile" BOOLEAN NOT NULL DEFAULT false,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL,
    "aggiornatoDa" TEXT,

    CONSTRAINT "CartaCarburante_pkey" PRIMARY KEY ("pan")
);

-- CreateTable
CREATE TABLE "AnagraficaImport" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nomeFile" TEXT NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "righe" INTEGER NOT NULL,
    "nuovi" INTEGER NOT NULL,
    "aggiornati" INTEGER NOT NULL,
    "invariati" INTEGER NOT NULL,
    "spariti" INTEGER NOT NULL,
    "eseguitoDa" TEXT NOT NULL,
    "eseguitoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnagraficaImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelepassRun" (
    "id" TEXT NOT NULL,
    "anno" INTEGER NOT NULL,
    "mese" INTEGER NOT NULL,
    "nomeFile" TEXT NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "righe" INTEGER NOT NULL,
    "fuoriMese" INTEGER NOT NULL,
    "nonMappati" INTEGER NOT NULL,
    "ricondotti" INTEGER NOT NULL,
    "totale" DOUBLE PRECISION NOT NULL,
    "totaliJson" JSONB NOT NULL,
    "anomalieJson" JSONB NOT NULL,
    "eseguitoDa" TEXT NOT NULL,
    "eseguitoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelepassRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Q8Run" (
    "id" TEXT NOT NULL,
    "anno" INTEGER NOT NULL,
    "mese" INTEGER NOT NULL,
    "nomeFile" TEXT NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "righeExport" INTEGER NOT NULL,
    "tenute" INTEGER NOT NULL,
    "scartate" INTEGER NOT NULL,
    "nonCensite" INTEGER NOT NULL,
    "perIdentificativo" INTEGER NOT NULL,
    "totale" DOUBLE PRECISION NOT NULL,
    "totaliJson" JSONB NOT NULL,
    "anomalieJson" JSONB NOT NULL,
    "eseguitoDa" TEXT NOT NULL,
    "eseguitoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Q8Run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelepassDispositivo_station_idx" ON "TelepassDispositivo"("station");

-- CreateIndex
CREATE INDEX "CartaCarburante_identificativo_idx" ON "CartaCarburante"("identificativo");

-- CreateIndex
CREATE INDEX "AnagraficaImport_tipo_eseguitoIl_idx" ON "AnagraficaImport"("tipo", "eseguitoIl");

-- CreateIndex
CREATE INDEX "TelepassRun_anno_mese_idx" ON "TelepassRun"("anno", "mese");

-- CreateIndex
CREATE INDEX "Q8Run_anno_mese_idx" ON "Q8Run"("anno", "mese");
