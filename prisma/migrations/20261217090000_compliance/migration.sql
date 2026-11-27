-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'COMPLIANCE';

-- CreateTable
CREATE TABLE "ComplianceTemplate" (
    "id" TEXT NOT NULL,
    "entita" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "ordine" INTEGER NOT NULL,
    "folder" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "formato" TEXT NOT NULL DEFAULT 'PDF',
    "nomeFileStandard" TEXT NOT NULL DEFAULT '',
    "facSimile" TEXT,
    "workflow" BOOLEAN NOT NULL DEFAULT true,
    "regolaScadenza" TEXT NOT NULL DEFAULT 'manuale',
    "frequenza" TEXT NOT NULL DEFAULT 'mensile',
    "mesiAttivi" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL DEFAULT '',
    "usato" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ComplianceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceRiga" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "anno" INTEGER NOT NULL,
    "mese" INTEGER NOT NULL,
    "scadenzaPortale" DATE,
    "scadenzaInterna" DATE,
    "stato" TEXT NOT NULL DEFAULT 'DA_RICHIEDERE',
    "caricatoDaId" TEXT,
    "caricatoDa" TEXT,
    "caricatoIl" TIMESTAMP(3),
    "nomeFileCaricato" TEXT,
    "dataRichiesta" DATE,
    "dataRicezione" DATE,
    "dataValidazione" DATE,
    "motivoRifiuto" TEXT,
    "note" TEXT,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL,
    "aggiornatoDa" TEXT,

    CONSTRAINT "ComplianceRiga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceStorico" (
    "id" TEXT NOT NULL,
    "rigaId" TEXT NOT NULL,
    "statoPrecedente" TEXT NOT NULL,
    "statoNuovo" TEXT NOT NULL,
    "utente" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origine" TEXT NOT NULL DEFAULT 'manuale',
    "nota" TEXT,

    CONSTRAINT "ComplianceStorico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceTemplate_entita_area_folder_key" ON "ComplianceTemplate"("entita", "area", "folder");

-- CreateIndex
CREATE INDEX "ComplianceRiga_anno_mese_idx" ON "ComplianceRiga"("anno", "mese");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceRiga_templateId_anno_mese_key" ON "ComplianceRiga"("templateId", "anno", "mese");

-- CreateIndex
CREATE INDEX "ComplianceStorico_rigaId_idx" ON "ComplianceStorico"("rigaId");

-- AddForeignKey
ALTER TABLE "ComplianceRiga" ADD CONSTRAINT "ComplianceRiga_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ComplianceTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceStorico" ADD CONSTRAINT "ComplianceStorico_rigaId_fkey" FOREIGN KEY ("rigaId") REFERENCES "ComplianceRiga"("id") ON DELETE CASCADE ON UPDATE CASCADE;

