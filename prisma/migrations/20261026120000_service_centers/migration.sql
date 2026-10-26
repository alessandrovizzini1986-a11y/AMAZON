-- Centri autorizzati Ayvens (officine/carrozzerie veicoli commerciali)
CREATE TABLE "ServiceCenter" (
    "id" TEXT NOT NULL,
    "ragioneSociale" TEXT NOT NULL,
    "regione" TEXT NOT NULL,
    "localita" TEXT NOT NULL,
    "provincia" TEXT NOT NULL,
    "indirizzo" TEXT NOT NULL,
    "officina" BOOLEAN NOT NULL,
    "carrozzeria" BOOLEAN NOT NULL,
    "rete" TEXT NOT NULL,
    "tuttiBrand" BOOLEAN NOT NULL,
    "transit" BOOLEAN NOT NULL,
    "fonte" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCenter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServiceCenter_regione_provincia_idx" ON "ServiceCenter"("regione", "provincia");
