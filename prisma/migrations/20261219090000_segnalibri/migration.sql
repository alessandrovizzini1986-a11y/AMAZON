CREATE TABLE "Segnalibro" (
    "id" TEXT NOT NULL,
    "titolo" TEXT NOT NULL,
    "descrizione" TEXT NOT NULL DEFAULT '',
    "istruzioni" TEXT NOT NULL DEFAULT '',
    "pulsanti" JSONB NOT NULL,
    "nomeFile" TEXT NOT NULL DEFAULT '',
    "pagina" BYTEA,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aggiornatoDa" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Segnalibro_pkey" PRIMARY KEY ("id")
);
