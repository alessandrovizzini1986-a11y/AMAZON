-- CreateTable
CREATE TABLE "AmazonInvoice" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "ds" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataFattura" TIMESTAMP(3) NOT NULL,
    "periodoDa" TIMESTAMP(3) NOT NULL,
    "periodoA" TIMESTAMP(3) NOT NULL,
    "importoDovuto" DECIMAL(12,2) NOT NULL,
    "sommaTotale" DECIMAL(12,2) NOT NULL,
    "sommaAvere" DECIMAL(12,2) NOT NULL,
    "nRighe" INTEGER NOT NULL,
    "rifNotaCredito" TEXT,
    "pdfNome" TEXT,
    "pdfSha256" TEXT,
    "fonte" TEXT NOT NULL,
    "esportataIl" TIMESTAMP(3),
    "esportataDaId" TEXT,
    "presenteInFatt2026Il" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmazonInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "ds" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "descrizione" TEXT NOT NULL,
    "quantita" INTEGER NOT NULL,
    "prezzo" DECIMAL(12,4) NOT NULL,
    "tasse" TEXT NOT NULL,
    "rateoIva" DECIMAL(5,4) NOT NULL,
    "importoIva" DECIMAL(12,2) NOT NULL,
    "totale" DECIMAL(12,2) NOT NULL,
    "avere" DECIMAL(12,2) NOT NULL,
    "microarea" TEXT,
    "macroarea" TEXT,
    "week" INTEGER NOT NULL,
    "mese" INTEGER NOT NULL,
    "anno" INTEGER NOT NULL,
    "classe" TEXT NOT NULL,
    "chiave" TEXT NOT NULL,

    CONSTRAINT "AmazonInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastFile" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "linea" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "caricatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caricatoDaId" TEXT,

    CONSTRAINT "ForecastFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastRoute" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "station" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "routes" INTEGER NOT NULL,
    "classe" TEXT NOT NULL,

    CONSTRAINT "ForecastRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastClasseMap" (
    "id" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "cycle" TEXT NOT NULL DEFAULT '*',
    "station" TEXT NOT NULL DEFAULT '*',
    "classe" TEXT NOT NULL,

    CONSTRAINT "ForecastClasseMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MacroareaMap" (
    "descrizione" TEXT NOT NULL,
    "macroarea" TEXT NOT NULL,
    "microarea" TEXT NOT NULL,

    CONSTRAINT "MacroareaMap_pkey" PRIMARY KEY ("descrizione")
);

-- CreateIndex
CREATE UNIQUE INDEX "AmazonInvoice_numero_key" ON "AmazonInvoice"("numero");

-- CreateIndex
CREATE INDEX "AmazonInvoice_ds_periodoDa_idx" ON "AmazonInvoice"("ds", "periodoDa");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonInvoiceLine_chiave_key" ON "AmazonInvoiceLine"("chiave");

-- CreateIndex
CREATE INDEX "AmazonInvoiceLine_invoiceId_idx" ON "AmazonInvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "AmazonInvoiceLine_ds_data_idx" ON "AmazonInvoiceLine"("ds", "data");

-- CreateIndex
CREATE INDEX "AmazonInvoiceLine_anno_mese_idx" ON "AmazonInvoiceLine"("anno", "mese");

-- CreateIndex
CREATE INDEX "AmazonInvoiceLine_anno_week_idx" ON "AmazonInvoiceLine"("anno", "week");

-- CreateIndex
CREATE INDEX "AmazonInvoiceLine_classe_idx" ON "AmazonInvoiceLine"("classe");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastFile_sha256_key" ON "ForecastFile"("sha256");

-- CreateIndex
CREATE INDEX "ForecastRoute_station_data_idx" ON "ForecastRoute"("station", "data");

-- CreateIndex
CREATE INDEX "ForecastRoute_week_idx" ON "ForecastRoute"("week");

-- CreateIndex
CREATE INDEX "ForecastRoute_fileId_idx" ON "ForecastRoute"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastClasseMap_serviceType_cycle_station_key" ON "ForecastClasseMap"("serviceType", "cycle", "station");

-- AddForeignKey
ALTER TABLE "AmazonInvoiceLine" ADD CONSTRAINT "AmazonInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "AmazonInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastRoute" ADD CONSTRAINT "ForecastRoute_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ForecastFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mappa forecast → classe (kit: forecast/mappa_forecast_classe.csv + eccezione DLO5 Sameday → SD_B)
INSERT INTO "ForecastClasseMap" ("id", "serviceType", "cycle", "station", "classe") VALUES
    ('kit_fc_01', 'Standard Parcel', '*', '*', 'ND_STANDARD'),
    ('kit_fc_02', 'Standard Parcel - 6.4H', '*', '*', 'ND_STANDARD'),
    ('kit_fc_03', 'Standard Parcel - 7.4H', '*', '*', 'ND_STANDARD'),
    ('kit_fc_04', 'Standard Parcel Away Team 60', '*', '*', 'ND_STANDARD'),
    ('kit_fc_05', 'ORDT Parcel', '*', '*', 'ND_ORDT'),
    ('kit_fc_06', 'MFN Pickup - Large Full Van', '*', '*', 'ND_SWA'),
    ('kit_fc_07', 'Cargo Electric Bicycle', '*', '*', 'ND_CARGOBIKE'),
    ('kit_fc_08', 'Sameday Parcel', 'CYCLE_SD_A', '*', 'SD_A'),
    ('kit_fc_09', 'Sameday Parcel', 'CYCLE_SD_B', '*', 'SD_C'),
    ('kit_fc_10', 'Sameday Parcel', 'CYCLE_SD_C', '*', 'SD_C'),
    ('kit_fc_11', 'Multi-Use', '*', '*', 'SD_B'),
    ('kit_fc_12', 'Sameday Parcel', '*', 'DLO5', 'SD_B')
ON CONFLICT DO NOTHING;

-- Mapping MACROAREA / MICROAREA (kit: mapping_macroarea.csv)
INSERT INTO "MacroareaMap" ("descrizione", "macroarea", "microarea") VALUES
    ('Standard Parcel with Helper Block of 8 Hours 24 Minutes', 'ROTTA HELPER 8,24', 'W HELPER 8H'),
    ('Standard Parcel with Helper (Ironhide) - Block of 8 Hours 24 Minutes.', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel with Helper (Ironhide) - Block of 8 Hours 24 Minutes', 'ROTTA HELPER 8,24', 'W HELPER 8H'),
    ('Standard Parcel with Helper - Blueberry - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel with Helper - Block of 8 Hours 24 Minutes', 'ROTTA HELPER 8,24', 'W HELPER 8H'),
    ('Standard Parcel Special Access Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel Small Van Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel Small Van - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel Medium Van Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel Medium Van - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel Block of 8 Hours', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel Block of 4 Hours', 'ROTTA 4', 'STANDARD 4H'),
    ('Standard Parcel - Special Access Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Special Access - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Small Van Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Small Van - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Small Van - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Ride Along (Ironhide) - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Low Emission Vehicle (Large) - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Low Emission Vehicle (350CF/81KWh) - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Large Van Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Large Van - Special Access - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Large Van - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Blueberry - Block of 8 Hours 24 Minutes Nursery Route Level 2 - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Blueberry - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Blueberry - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Block_x000D_
of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Block of 9 Hours', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Block of 8 Hours 24 Minutes.', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Block of 8 Hours', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Block of 7 Hours 48 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Block of 7 Hours', 'ROTTA 7', 'STANDARD 8H'),
    ('Standard Parcel - Block of 6 Hours', 'ROTTA 6', 'STANDARD 4H'),
    ('Standard Parcel - Block of 5 Hours 48 Minutes', 'ROTTA 6', 'STANDARD 4H'),
    ('Standard Parcel - Block of 4 Hours', 'ROTTA 4', 'STANDARD 4H'),
    ('Standard Parcel - Block di 8 Hours 24 Minutes.', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Block di 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - AMZ Donations - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Sameday Parcel Block of 6 Hours', 'SAME A', 'SAME A'),
    ('Sameday Parcel Block of 5 Hours', 'SAME - DOMENICA', 'SAME - DOMENICA'),
    ('Sameday Parcel Block of 4 Hours', 'SAME B', 'SAME B'),
    ('Sameday Parcel Block of 3 Hours', 'SAME C', 'SAME C'),
    ('Sameday Parcel - Block of 6 Hours', 'SAME A', 'SAME A'),
    ('Sameday Parcel - Block of 6 Hours', 'SAME A', 'SAME A'),
    ('Sameday Parcel - Block of 5 Hours 30 Minutes.', 'SAME A', 'SAME A'),
    ('Sameday Parcel - Block of 5 Hours 30 Minutes', 'SAME A', 'SAME A'),
    ('Sameday Parcel - Block of 5 Hours', 'SAME - DOMENICA', 'SAME - DOMENICA'),
    ('Sameday Parcel - Block of 5 Hours', 'SAME - DOMENICA', 'SAME - DOMENICA'),
    ('Sameday Parcel - Block of 4 Hours 30 Minutes.', 'SAME B', 'SAME B'),
    ('Sameday Parcel - Block of 4 Hours 30 Minutes', 'SAME B', 'SAME B'),
    ('Sameday Parcel - Block of 4 Hours', 'SAME B', 'SAME B'),
    ('Sameday Parcel - Block of 4 Hours', 'SAME B', 'SAME B'),
    ('Sameday Parcel - Block of 3 Hours 30 Minutes', 'SAME B', 'SAME B'),
    ('Sameday Parcel - Block of 3 Hours', 'SAME C', 'SAME C'),
    ('Sameday Parcel - Block of 3 Hours', 'SAME C', 'SAME C'),
    ('Rimborso pedaggi', 'Pedaggi', ''),
    ('Rimborso pagamento insufficiente DSP', 'Rimborso pagamento insufficiente DSP', ''),
    ('Rimborso Ore variabili', 'Rimborso Ore variabili', ''),
    ('Rimborso incentivo stagionale', 'INCENTIVI', ''),
    ('Rimborso Incentivo alle prestazioni', 'INCENTIVI', ''),
    ('Rimborso - pedaggi', 'Pedaggi', ''),
    ('Rimborso - pagamento insufficiente DSP', 'Rimborso pagamento insufficiente DSP', ''),
    ('Rimborso - Ore variabili', 'Rimborso Ore variabili', ''),
    ('Rimborso - incentivo stagionale', 'INCENTIVI', ''),
    ('Rimborso - Incentivo alle prestazioni', 'INCENTIVI', ''),
    ('Rescue Block of 8 Hours 24 Minutes', 'RESCUE', 'RESCUE'),
    ('Rescue Block of 7 Hours', 'RESCUE', 'RESCUE'),
    ('Rescue Block of 6 Hours', 'ROTTA 6', 'STANDARD 4H'),
    ('Rescue Block of 5 Hours', 'ROTTA 5', 'STANDARD 4H'),
    ('Rescue Block of 4 Hours.', 'SAME B', 'SAME B'),
    ('Rescue Block of 4 Hours', 'ROTTA 4', 'STANDARD 4H'),
    ('Rescue Block of 3 Hours', 'SAME C', 'SAME C'),
    ('Rescue - Block of 8 Hours 24 Minutes', 'RESCUE', 'RESCUE'),
    ('Rescue - Block of 8 Hours', 'ROTTA 8', 'STANDARD 8H'),
    ('Rescue - Block of 7 Hours', 'ROTTA 7', 'STANDARD 8H'),
    ('Rescue - Block of 6 Hours', 'ROTTA 6', 'STANDARD 4H'),
    ('Rescue - Block of 5 Hours', 'ROTTA 5', 'STANDARD 4H'),
    ('Rescue - Block of 4 Hours', 'ROTTA 4', 'STANDARD 4H'),
    ('Rescue - Block of 3 Hours 30 Minutes', 'SAME B', 'SAME B'),
    ('Rescue - Block of 3 Hours', 'SAME C', 'SAME C'),
    ('Re-bill INV for INV-IT3JDBF-0001727 dated 2025/09/17', 'Rimborso pagamento insufficiente DSP', ''),
    ('Re-bill INV for INV-IT3JDBF-0001724 dated 2025/09/1', 'Rimborso pagamento insufficiente DSP', ''),
    ('Re-bill INV for INV-IT3JDBF-0001723 dated 2025/09/17', 'Rimborso pagamento insufficiente DSP', ''),
    ('Pedaggi', 'Pedaggi', ''),
    ('Pagamento non ricorrente SEP-2025', 'Rimborso pagamento insufficiente DSP', ''),
    ('Pagamento non ricorrente OCT-2025', 'Rimborso pagamento insufficiente DSP', ''),
    ('Pagamento non ricorrente OCT-2025', 'Rimborso pagamento insufficiente DSP', ''),
    ('Pagamento non ricorrente NOV-2025', 'Rimborso pagamento insufficiente DSP', ''),
    ('Pagamento non ricorrente DEC-2025', 'Rimborso pagamento insufficiente DSP', ''),
    ('Pagamento incentivi – Incentivo stagionale', 'INCENTIVI', ''),
    ('Pagamento incentivi – Incentivi settimanali DEI', 'INCENTIVI', ''),
    ('Pagamento incentivi', 'INCENTIVI', ''),
    ('Pagamento incentivi', 'INCENTIVI', ''),
    ('Pagamenti Incentivi', 'INCENTIVI', ''),
    ('ORDT Parcel - Block of 8 Hours 24 Minutes.', 'ROTTA 8,24', 'STANDARD 8H'),
    ('ORDT Parcel - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('ORDT Parcel - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('ORDT Parcel - Block di 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('ORDT Extra large cargo van - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 4 Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 4 - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 4 - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 4 - Block di 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 3 Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 3 - Low Emissions Vehicle - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 3 - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 3 - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 3 - Block di 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 2 Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 2 - Low Emissions Vehicle - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 2 - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 2 - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 2 - Block of 8 Hours', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 2 - Block di 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 1 Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 1 - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 1 - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 1 - Block di 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Multi-Use Block of 3 Hours 30 Minutes', 'SAME B', 'SAME B'),
    ('Multi-Use - Block of 3 Hours 30 Minutes', 'SAME B', 'SAME B'),
    ('Multi-Use - Block of 3 Hours 30 Minutes', 'SAME B', 'SAME B'),
    ('Multi-Use - Block of 3 Hours', 'SAME C', 'SAME C'),
    ('Multi-Use - Block di 3 Hours 30 Minutes', 'SAME B', 'SAME B'),
    ('Modifiche Rimborso - pagamento insufficiente DSP', 'Rimborso pagamento insufficiente DSP', ''),
    ('Modifiche - Standard Parcel - Block of 8 Hours 24 Minuti - AMZL Late Cancel- weekend', 'ROTTE ABORT WEEKEND', 'ABORT'),
    ('Modifiche - Standard Parcel - Block of 8 Hours 24 Minuti - AMZL Late Cancel- weekday', 'ROTTE ABORT WEEKDAY', 'ABORT'),
    ('Modifiche - Sameday Parcel - Block of 6 Hours - AMZL Late Cancel- weekend', 'SAME DAY - ABORT WEEKEND', 'SAME DAY - ABORT WEEKEND'),
    ('Modifiche - Rimborso - pedaggi', 'Pedaggi', ''),
    ('Modifiche - Rimborso - modifica tasso per giorni festivi e domenica', 'Modifiche - Rimborso - modifica tasso per festivi', ''),
    ('Modifiche - Rimborso - modifica tasso per festivi', 'Modifiche - Rimborso - modifica tasso per festivi', ''),
    ('Modifiche - Pedaggi', 'Pedaggi', ''),
    ('Micro Transport - Large Van Block of 4 Hours', 'SWA', 'STANDARD 4H'),
    ('MFN Pickup Standard Full Van Block of 4 Hours', 'SWA', 'STANDARD 4H'),
    ('MFN Pickup - Large Full Van Block of 4 Hours.', 'SWA', 'STANDARD 4H'),
    ('MFN Pickup - Large Full Van Block of 4 Hours', 'SWA', 'STANDARD 4H'),
    ('MFN Pickup - Large Full Van - Block of 5 Hours', 'SWA', 'STANDARD 4H'),
    ('MFN Pickup - Large Full Van - Block of 4 Hours', 'SWA', 'STANDARD 4H'),
    ('MFN Pickup - Large Full Van - Block of 3 Hours 54 Minutes', 'SWA', 'STANDARD 4H'),
    ('Late Cancel - Standard Parcel - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Late Cancel - Nursery Route Level 4 - Block of 8 Hours 24 Minutes', 'ROTTE ABORT WEEKDAY', 'ABORT'),
    ('Incentivo Stagionale', 'INCENTIVI', ''),
    ('Incentivi settimanali - DEI', 'INCENTIVI', ''),
    ('FuelAllowance', 'Carburante', ''),
    ('FuelAllowance', 'Carburante', ''),
    ('Fuel Allowance', 'Carburante', ''),
    ('DSP Bonus Coverage weekend', 'DSP Bonus Coverage weekend', ''),
    ('DSP Bonus Coverage weekday', 'DSP Bonus Coverage weekday', ''),
    ('DSP Bonus Coverage - weekend', 'DSP Bonus Coverage weekend', ''),
    ('DSP Bonus Coverage - weekday', 'DSP Bonus Coverage weekday', ''),
    ('Credit Note for INV-IT3JDBF-0001747 dated 2025/10/01', 'INCENTIVI', ''),
    ('Credit Note for INV-IT3JDBF-0001727 dated 2025/09/17', 'Rimborso pagamento insufficiente DSP', ''),
    ('Credit Note for INV-IT3JDBF-0001724 dated 2025/09/17', 'Rimborso pagamento insufficiente DSP', ''),
    ('Credit Note for INV-IT3JDBF-0001723 dated 2025/09/17', 'Rimborso pagamento insufficiente DSP', ''),
    ('Cargo Electric Bicycle Large Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Cargo Electric Bicycle Large - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Cargo Electric Bicycle Extra Large - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Box Truck Parcel (Medium) - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Box Truck Parcel (Medium) - Block of 8 Hours 24 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('AMZL weekday', 'ROTTA 8,24', 'STANDARD 8H'),
    ('AMZL Late Cancel weekend', 'ROTTE ABORT WEEKEND', 'ABORT'),
    ('AMZL Late Cancel weekday', 'ROTTE ABORT WEEKDAY', 'ABORT'),
    ('AMZL Late Cancel - weekend', 'ROTTE ABORT WEEKEND', 'ABORT'),
    ('AMZL Late Cancel - weekend', 'ROTTE ABORT WEEKEND', 'ABORT'),
    ('AMZL Late Cancel - weekday INV-IT3JDBF-0001960', 'ROTTE ABORT WEEKDAY', 'ABORT'),
    ('AMZL Late Cancel - weekday', 'ROTTE ABORT WEEKDAY', 'ABORT'),
    ('AMZL Late Cancel - weekday', 'ROTTE ABORT WEEKDAY', 'ABORT'),
    ('Altri pagamenti', 'Rimborso pagamento insufficiente DSP', ''),
    ('MFN Pickup - Standard Full Van - Block of 3 Hours 54 Minutes', 'SWA', 'STANDARD 4H'),
    ('Rescue - Block of 7 Hours 48 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 1 - Block of 7 Hours 48 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level 4 - Block of 7 Hours 48 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Blueberry - Block of 7 Hours 48 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('ORDT Parcel - Block of 7 Hours 48 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Low Emission Vehicle (350CF/81KWh) - Block of 7 Hours 48 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Small Van - Block of 7 Hours 48 Minutes', 'ROTTA 8,24', '24'),
    ('Nursery Route Level 1 - Block of 4 Hours', 'ROTTA 4', 'STANDARD 4H'),
    ('Nursery Route Level 2 - Block of 4 Hours', 'ROTTA 4', 'STANDARD 4H'),
    ('Nursery Route Level 3 - Block of 7 Hours 48 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Credit Note for INV-IT3JDBF-0001728', 'INCENTIVI', ''),
    ('Standard Parcel - Block of 6 Hours 48 Minutes', 'ROTTA 6', 'STANDARD 4H'),
    ('Standard Parcel - Block of 3 Hours 54 Minutes', 'SWA', 'STANDARD 4H'),
    ('Nursery Route Level 2 - Block of 7 Hours 48 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Special Access - Block of 7 Hours 48 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('DSP - Correzione Di Pagamento', 'DSP - Correzione Di Pagamento', ''),
    ('Credit Note for INV-IT3JDBF-0001727', 'INCENTIVI', ''),
    ('Re-bill INV for INV-IT3JDBF-0001727', 'Rimborso pagamento insufficiente DSP', ''),
    ('Credit Note for INV-IT3JDBF-0001724', 'INCENTIVI', ''),
    ('Re-bill INV for INV-IT3JDBF-0001724 dated 2025/09/17', 'Rimborso pagamento insufficiente DSP', ''),
    ('Credit Note for INV-IT3JDBF-0001726', 'INCENTIVI', ''),
    ('Re-bill INV for INV-IT3JDBF-0001726', 'Rimborso pagamento insufficiente DSP', ''),
    ('Adeguamento retroattivo della scheda tariffaria', 'Rimborso pagamento insufficiente DSP', ''),
    ('Standard Parcel - Low Emission Vehicle (Large) - Block of 7 Hours 48 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level - 1 Block of 7 Hours 48 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level - 2 Block of 7 Hours 48 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Modifiche - Carburante', 'Carburante', ''),
    ('Modifiche - MFN Pickup - Large Full Van - Block of 3 Hours 54 Minuti - MFN Pickup - Large Full Van - Block of 3 Hours 54 Minutes', 'SWA', 'STANDARD 4H'),
    ('Incentivi - Pedaggi', 'Pedaggi', ''),
    ('Incentivi - Parcheggio', 'PARCHEGGI', ''),
    ('Sameday Parcel - Block of Hours 4', 'ROTTA 4', 'STANDARD 4H'),
    ('Standard Parcel - Block of 4 Hours 48 Minutes', 'ROTTA 5', 'STANDARD 4H'),
    ('OTR Services', 'Pedaggi', ''),
    ('Training Day - Block of 7 Hours 48 Minutes', 'Training', ''),
    ('Standard Parcel - Low Emission Vehicle (210CF/66KWh) - Block of 7 Hours 48 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Nursery Route Level - 3 Block of 7 Hours 48 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('OTR Services WK18 - Missing Payment', 'Pedaggi', ''),
    ('Nursery Route Level - 4 Block of 7 Hours 48 Minutes', 'ROTTA 8', '24'),
    ('Rescue - Block of Hours 4', 'RESCUE', 'RESCUE'),
    ('Pagamento non ricorrente JUL-2026', 'Carburante', ''),
    ('Sameday Parcel - Block of Hours 3', 'SAME B', 'SAME B'),
    ('Credit Note for INV-IT3JDBF-0002366 dated 2026/07/22', 'PARCHEGGI', ''),
    ('Credit Note for INV-IT3JDBF-0002365 dated 2026/07/22', 'PARCHEGGI', ''),
    ('Credit Note for INV-IT3JDBF-0002369 dated 2026/07/22', 'PARCHEGGI', ''),
    ('Credit Note for INV-IT3JDBF-0002367 dated 2026/07/22', 'PARCHEGGI', ''),
    ('Credit Note for INV-IT3JDBF-0002368 dated 2026/07/22', 'PARCHEGGI', ''),
    ('Micro Oversize Parcels - Standard Van - Block of 3 Hours 54 Minutes', 'MICRO', ''),
    ('Cargo Electric Bicycle - Block of 3 Hours 54 Minutes', 'ROTTA 4', 'STANDARD 4H'),
    ('Standard Parcel Away Team 60 - Block of 7 Hours 48 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Box Truck Parcel (Medium) - Block of 7 Hours 48 Minutes', 'ROTTA 8,24', 'STANDARD 8H'),
    ('Standard Parcel - Park and Walk - Block of 7 Hours 48 Minutes', 'ROTTA 8,24', 'STANDARD 8H')
ON CONFLICT DO NOTHING;
