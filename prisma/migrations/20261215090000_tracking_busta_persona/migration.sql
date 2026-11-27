-- CreateTable
CREATE TABLE "TrackingPersonaMese" (
    "mese" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "gruppo" TEXT NOT NULL,
    "chiave" TEXT NOT NULL,
    "cf" TEXT NOT NULL DEFAULT '',
    "matricola" TEXT NOT NULL DEFAULT '',
    "nome" TEXT NOT NULL DEFAULT '',
    "contratto" TEXT NOT NULL DEFAULT '',
    "oreLavoro" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oreStraord" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oreSuppl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oreFerie" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ggFerie" INTEGER NOT NULL DEFAULT 0,
    "oreRol" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oreExf" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oreMalattia" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oreInfortunio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oreAltro" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salvatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingPersonaMese_pkey" PRIMARY KEY ("mese","station","gruppo","chiave")
);

-- CreateTable
CREATE TABLE "BustaLavoroPersona" (
    "meseLavoro" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "gruppo" TEXT NOT NULL,
    "cf" TEXT NOT NULL,
    "codice" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "meseBusta" TEXT NOT NULL,
    "oreOrdinarie" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oreStraord" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oreSuppl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oreFerie" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ggFerie" INTEGER NOT NULL DEFAULT 0,
    "oreRol" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oreExf" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oreMalattia" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oreInfortunio" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "BustaLavoroPersona_pkey" PRIMARY KEY ("meseLavoro","station","gruppo","cf")
);

