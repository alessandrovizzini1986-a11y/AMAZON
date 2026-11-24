CREATE TABLE "GlsBollettino" (
    "id" TEXT NOT NULL,
    "impronta" TEXT NOT NULL,
    "dataSpedizione" TEXT NOT NULL,
    "numero" TEXT NOT NULL DEFAULT '',
    "mittente" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,
    "citta" TEXT NOT NULL,
    "cap" TEXT NOT NULL,
    "colli" TEXT NOT NULL,
    "pesoKg" TEXT NOT NULL DEFAULT '',
    "contrassegno" TEXT NOT NULL DEFAULT '',
    "dati" JSONB NOT NULL,
    "azioni" TEXT NOT NULL,
    "creatoDa" TEXT NOT NULL,
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaAzioneIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GlsBollettino_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GlsBollettino_impronta_key" ON "GlsBollettino"("impronta");
CREATE INDEX "GlsBollettino_creatoIl_idx" ON "GlsBollettino"("creatoIl");
