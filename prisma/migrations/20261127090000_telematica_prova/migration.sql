CREATE TABLE "TelematicaProva" (
    "id" TEXT NOT NULL,
    "fonte" TEXT NOT NULL,
    "chiamata" TEXT NOT NULL,
    "cosa" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "stato" INTEGER,
    "elementi" INTEGER,
    "errore" TEXT,
    "risposta" JSONB,
    "eseguitaIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelematicaProva_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelematicaProva_fonte_chiamata_key" ON "TelematicaProva"("fonte", "chiamata");
