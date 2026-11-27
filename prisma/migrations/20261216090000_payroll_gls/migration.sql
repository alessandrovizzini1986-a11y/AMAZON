-- CreateTable
CREATE TABLE "PayrollGlsRiga" (
    "id" TEXT NOT NULL,
    "mesePaga" TEXT NOT NULL,
    "matr" TEXT NOT NULL,
    "dipe" TEXT NOT NULL,
    "cod1" TEXT NOT NULL,
    "cod2" TEXT NOT NULL,
    "descrizione" TEXT NOT NULL,
    "conto" TEXT NOT NULL,
    "importo" DECIMAL(14,2) NOT NULL,
    "componente" TEXT NOT NULL,
    "istituto" TEXT,

    CONSTRAINT "PayrollGlsRiga_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollGlsRiga_mesePaga_idx" ON "PayrollGlsRiga"("mesePaga");

