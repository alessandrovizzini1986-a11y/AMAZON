-- CreateTable
CREATE TABLE "CostoConsuntivo" (
    "id" TEXT NOT NULL,
    "anno" INTEGER NOT NULL,
    "mese" INTEGER NOT NULL,
    "ds" TEXT NOT NULL,
    "voce" TEXT NOT NULL,
    "importo" DECIMAL(14,2) NOT NULL,
    "fonte" TEXT NOT NULL,
    "caricatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostoConsuntivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CostoConsuntivo_anno_mese_idx" ON "CostoConsuntivo"("anno", "mese");

-- CreateIndex
CREATE UNIQUE INDEX "CostoConsuntivo_anno_mese_ds_voce_key" ON "CostoConsuntivo"("anno", "mese", "ds", "voce");
