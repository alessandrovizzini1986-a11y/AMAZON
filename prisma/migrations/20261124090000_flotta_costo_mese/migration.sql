CREATE TABLE "FlottaCostoMese" (
    "id" TEXT NOT NULL,
    "mese" TEXT NOT NULL,
    "appalto" TEXT NOT NULL,
    "compagnia" TEXT NOT NULL,
    "mezzi" INTEGER,
    "canone" DECIMAL(12,2) NOT NULL,
    "stimati" INTEGER NOT NULL DEFAULT 0,
    "fonte" TEXT NOT NULL DEFAULT 'SITO',
    "aggiornatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FlottaCostoMese_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FlottaCostoMese_mese_appalto_compagnia_key" ON "FlottaCostoMese"("mese", "appalto", "compagnia");
