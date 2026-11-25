CREATE TABLE "PersonaleMese" (
    "mese" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "gruppo" TEXT NOT NULL,
    "teste" INTEGER NOT NULL,
    "calendario" BOOLEAN NOT NULL DEFAULT true,
    "rotte" INTEGER,
    "rotteTd" INTEGER NOT NULL DEFAULT 0,
    "rotteStimate" BOOLEAN NOT NULL DEFAULT false,
    "ggMalattia" INTEGER NOT NULL DEFAULT 0,
    "ggInfortunio" INTEGER NOT NULL DEFAULT 0,
    "ggFerie" INTEGER NOT NULL DEFAULT 0,
    "ggRol" INTEGER NOT NULL DEFAULT 0,
    "ggExfest" INTEGER NOT NULL DEFAULT 0,
    "persMalattia" INTEGER NOT NULL DEFAULT 0,
    "persInfortunio" INTEGER NOT NULL DEFAULT 0,
    "persAssenti" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PersonaleMese_pkey" PRIMARY KEY ("mese", "station", "gruppo")
);
