CREATE TABLE "UsoPagina" (
    "giorno" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "voce" TEXT NOT NULL,
    "visite" INTEGER NOT NULL DEFAULT 0,
    "secondi" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "UsoPagina_pkey" PRIMARY KEY ("giorno", "userId", "voce")
);
CREATE INDEX "UsoPagina_voce_idx" ON "UsoPagina"("voce");
