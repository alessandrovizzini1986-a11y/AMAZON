CREATE TABLE "PersonaleAssenzaPersona" (
    "mese" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "gruppo" TEXT NOT NULL,
    "codice" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "ggLavorati" INTEGER NOT NULL DEFAULT 0,
    "ggMalattia" INTEGER NOT NULL DEFAULT 0,
    "ggInfortunio" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PersonaleAssenzaPersona_pkey" PRIMARY KEY ("mese","station","gruppo","codice")
);
