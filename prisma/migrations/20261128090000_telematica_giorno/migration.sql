CREATE TABLE "TelematicaGiorno" (
    "id" TEXT NOT NULL,
    "fonte" TEXT NOT NULL,
    "targa" TEXT NOT NULL,
    "idMezzo" TEXT NOT NULL,
    "giorno" TEXT NOT NULL,
    "km" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inizio" TIMESTAMP(3),
    "fine" TIMESTAMP(3),
    "guidaSec" INTEGER NOT NULL DEFAULT 0,
    "motoreSec" INTEGER NOT NULL DEFAULT 0,
    "fermoMotoreAccSec" INTEGER NOT NULL DEFAULT 0,
    "velMax" INTEGER,
    "punteggioSicurezza" DOUBLE PRECISION,
    "soste" INTEGER NOT NULL DEFAULT 0,
    "rifornimenti" INTEGER NOT NULL DEFAULT 0,
    "litri" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kmContatore" DOUBLE PRECISION,
    "autista" TEXT,
    "tappe" JSONB,
    "scaricatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelematicaGiorno_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelematicaGiorno_fonte_targa_giorno_key" ON "TelematicaGiorno"("fonte", "targa", "giorno");
CREATE INDEX "TelematicaGiorno_giorno_idx" ON "TelematicaGiorno"("giorno");
CREATE INDEX "TelematicaGiorno_targa_giorno_idx" ON "TelematicaGiorno"("targa", "giorno");
CREATE TABLE "TelematicaScarico" (
    "giorno" TEXT NOT NULL,
    "mezzi" INTEGER NOT NULL,
    "errori" INTEGER NOT NULL,
    "definitivo" BOOLEAN NOT NULL DEFAULT false,
    "finitoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelematicaScarico_pkey" PRIMARY KEY ("giorno")
);
