CREATE TABLE "OrganicoPersona" (
    "versione" TEXT NOT NULL,
    "matricola" TEXT NOT NULL,
    "cf" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "mansione" TEXT NOT NULL DEFAULT '',
    "tipoContratto" TEXT NOT NULL DEFAULT '',
    "pctPt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dataAssunzione" TIMESTAMP(3),
    "dataCessazione" TIMESTAMP(3),
    "causaCessazione" TEXT NOT NULL DEFAULT '',
    "scadenzaTd" TIMESTAMP(3),

    CONSTRAINT "OrganicoPersona_pkey" PRIMARY KEY ("versione","cf")
);
CREATE INDEX "OrganicoPersona_versione_station_idx" ON "OrganicoPersona"("versione", "station");
