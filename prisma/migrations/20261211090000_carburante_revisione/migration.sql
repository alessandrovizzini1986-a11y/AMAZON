-- L'archiviazione ricorda lo stato e i numeri della riga: se dopo nuovi dati la riga peggiora, torna visibile.
ALTER TABLE "CarburanteGiustifica" ADD COLUMN "stato" TEXT;
ALTER TABLE "CarburanteGiustifica" ADD COLUMN "deltaLitri" DOUBLE PRECISION;
ALTER TABLE "CarburanteGiustifica" ADD COLUMN "euro" DOUBLE PRECISION;

-- Segreti generati dal database (mai nel codice): servono a fare chiavi non reversibili, per esempio delle transazioni Q8.
CREATE TABLE "SegretoInterno" (
    "chiave" TEXT NOT NULL,
    "valore" TEXT NOT NULL,
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SegretoInterno_pkey" PRIMARY KEY ("chiave")
);
INSERT INTO "SegretoInterno" ("chiave", "valore") VALUES ('q8.chiave', md5(random()::text || clock_timestamp()::text) || md5(random()::text || clock_timestamp()::text))
ON CONFLICT ("chiave") DO NOTHING;
