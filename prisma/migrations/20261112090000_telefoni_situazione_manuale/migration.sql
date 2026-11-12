-- Situazione corretta a mano (vince su quella calcolata da stato e note). Tabella a parte: il ricaricamento dei file non la cancella.
CREATE TABLE "SituazioneManuale" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "chiave" TEXT NOT NULL,
    "situazione" TEXT NOT NULL,
    "motivo" TEXT,
    "utenteId" TEXT,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SituazioneManuale_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SituazioneManuale_tipo_chiave_key" ON "SituazioneManuale"("tipo", "chiave");
