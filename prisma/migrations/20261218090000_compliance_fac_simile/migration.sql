-- CreateTable
CREATE TABLE "ComplianceFacSimile" (
    "file" TEXT NOT NULL,
    "dati" BYTEA NOT NULL,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceFacSimile_pkey" PRIMARY KEY ("file")
);

