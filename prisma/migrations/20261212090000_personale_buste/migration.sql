-- CreateTable
CREATE TABLE "PersonaleBustaMese" (
    "mese" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "gruppo" TEXT NOT NULL,
    "teste" INTEGER NOT NULL,
    "lordo" DOUBLE PRECISION NOT NULL,
    "tfr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impInps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "senzaTotali" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PersonaleBustaMese_pkey" PRIMARY KEY ("mese","station","gruppo")
);

-- CreateTable
CREATE TABLE "PersonaleBustaVoce" (
    "mese" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "gruppo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "voce" TEXT NOT NULL DEFAULT '',
    "importo" DOUBLE PRECISION NOT NULL,
    "ore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "persone" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PersonaleBustaVoce_pkey" PRIMARY KEY ("mese","station","gruppo","categoria","voce")
);

-- CreateTable
CREATE TABLE "PersonaleOrePersona" (
    "mese" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "gruppo" TEXT NOT NULL,
    "codice" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "qualifica" TEXT NOT NULL DEFAULT '',
    "meseLavoro" TEXT,
    "oreLav" DOUBLE PRECISION,
    "ggLav" INTEGER,
    "oreStr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oreMagg" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "PersonaleOrePersona_pkey" PRIMARY KEY ("mese","station","gruppo","codice")
);

-- CreateTable
CREATE TABLE "PersonaleRateiPersona" (
    "mese" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "gruppo" TEXT NOT NULL,
    "codice" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "qualifica" TEXT NOT NULL DEFAULT '',
    "ferieUnita" TEXT NOT NULL DEFAULT 'GG',
    "ferieSaldo" DOUBLE PRECISION,
    "ferieMatur" DOUBLE PRECISION,
    "ferieGoduto" DOUBLE PRECISION,
    "ferieResAP" DOUBLE PRECISION,
    "rolSaldo" DOUBLE PRECISION,
    "rolMatur" DOUBLE PRECISION,
    "rolGoduto" DOUBLE PRECISION,
    "exfestSaldo" DOUBLE PRECISION,
    "exfestMatur" DOUBLE PRECISION,
    "exfestGoduto" DOUBLE PRECISION,

    CONSTRAINT "PersonaleRateiPersona_pkey" PRIMARY KEY ("mese","station","gruppo","codice")
);

