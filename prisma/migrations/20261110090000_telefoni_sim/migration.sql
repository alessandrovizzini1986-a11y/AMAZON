-- CreateTable
CREATE TABLE "Sim" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "iccid" TEXT,
    "inWind" BOOLEAN NOT NULL DEFAULT false,
    "statoWind" TEXT,
    "attivazione" DATE,
    "piano" TEXT,
    "contratto" TEXT,
    "station" TEXT,
    "tag" TEXT,
    "assegnatario" TEXT,
    "stato" TEXT,
    "pin" TEXT,
    "puk" TEXT,
    "imei" TEXT,
    "note" TEXT,
    "fonti" TEXT,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Telefono" (
    "id" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "inWind" BOOLEAN NOT NULL DEFAULT false,
    "statoWind" TEXT,
    "attivazione" DATE,
    "contratto" TEXT,
    "station" TEXT,
    "tag" TEXT,
    "modello" TEXT,
    "assegnatario" TEXT,
    "stato" TEXT,
    "numero" TEXT,
    "note" TEXT,
    "fonti" TEXT,
    "aggiornatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Telefono_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sim_numero_key" ON "Sim"("numero");
CREATE INDEX "Sim_station_idx" ON "Sim"("station");
CREATE UNIQUE INDEX "Telefono_imei_key" ON "Telefono"("imei");
CREATE INDEX "Telefono_station_idx" ON "Telefono"("station");
