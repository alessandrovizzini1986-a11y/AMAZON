-- Ordini di veicoli nuovi presso il noleggiatore (es. Ayvens per GLS)
CREATE TABLE "FleetOrder" (
    "id" TEXT NOT NULL,
    "fornitore" TEXT NOT NULL,
    "appalto" TEXT NOT NULL,
    "refOrdine" TEXT NOT NULL,
    "targa" TEXT,
    "statoFornitore" TEXT NOT NULL,
    "previstaConsegna" TIMESTAMP(3),
    "dataRitiro" TIMESTAMP(3),
    "marchio" TEXT,
    "modello" TEXT,
    "puntoRitiro" TEXT,
    "indirizzoRitiro" TEXT,
    "telaio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FleetOrder_fornitore_refOrdine_key" ON "FleetOrder"("fornitore", "refOrdine");
CREATE INDEX "FleetOrder_appalto_idx" ON "FleetOrder"("appalto");
