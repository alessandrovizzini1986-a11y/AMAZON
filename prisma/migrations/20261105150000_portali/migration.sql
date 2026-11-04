-- CreateTable
CREATE TABLE "PortaleCredenziale" (
    "id" TEXT NOT NULL,
    "portale" TEXT NOT NULL,
    "url" TEXT,
    "username" TEXT,
    "passwordCifrata" TEXT,
    "note" TEXT,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL,
    "aggiornatoDa" TEXT,

    CONSTRAINT "PortaleCredenziale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortaleCredenziale_portale_key" ON "PortaleCredenziale"("portale");
