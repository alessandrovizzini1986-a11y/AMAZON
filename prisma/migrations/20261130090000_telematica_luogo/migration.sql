CREATE TABLE "TelematicaLuogo" (
    "id" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "luogo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "creatoDa" TEXT NOT NULL,
    "creatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelematicaLuogo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TelematicaLuogo_station_luogo_key" ON "TelematicaLuogo"("station", "luogo");
