-- CreateTable
CREATE TABLE "AnagraficaCDL" (
    "id" TEXT NOT NULL,
    "meseVersione" TEXT NOT NULL,
    "cf" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "contratto" TEXT NOT NULL,
    "pctPt" DECIMAL(8,4),
    "hSettim" DECIMAL(8,2),
    "ggLavorativi" DECIMAL(8,2),
    "tipologiaPt" TEXT NOT NULL,
    "rlm" DECIMAL(16,6),
    "edr" DECIMAL(16,6),
    "cdl" DECIMAL(16,6) NOT NULL,
    "savingFeGg" DECIMAL(16,6),
    "savingRolH" DECIMAL(16,6),
    "savingExfH" DECIMAL(16,6),
    "costoFestNonGodutaGg" DECIMAL(16,6),
    "straoForfait" DECIMAL(16,6),
    "caricatoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caricatoDa" TEXT,

    CONSTRAINT "AnagraficaCDL_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tariffa" (
    "id" TEXT NOT NULL,
    "voce" TEXT NOT NULL,
    "validaDal" DATE NOT NULL,
    "valore" DECIMAL(12,4) NOT NULL,
    "fonte" TEXT,

    CONSTRAINT "Tariffa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parametro" (
    "id" TEXT NOT NULL,
    "chiave" TEXT NOT NULL,
    "validaDal" DATE NOT NULL,
    "valore" DECIMAL(14,6) NOT NULL,
    "fonte" TEXT,
    "note" TEXT,

    CONSTRAINT "Parametro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Festivo" (
    "id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "descrizione" TEXT NOT NULL,
    "station" TEXT NOT NULL DEFAULT 'TUTTE',

    CONSTRAINT "Festivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AditRiga" (
    "id" TEXT NOT NULL,
    "meseFattura" TEXT NOT NULL,
    "meseCompetenza" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "cf" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "voceAdit" TEXT NOT NULL,
    "voce" TEXT NOT NULL,
    "quantita" DECIMAL(12,2) NOT NULL,
    "costo" DECIMAL(14,2) NOT NULL,
    "residuo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AditRiga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRiga" (
    "id" TEXT NOT NULL,
    "mesePaga" TEXT NOT NULL,
    "matr" TEXT NOT NULL,
    "dipe" TEXT NOT NULL,
    "station" TEXT,
    "cod1" TEXT NOT NULL,
    "cod2" TEXT NOT NULL,
    "descrizione" TEXT NOT NULL,
    "conto" TEXT NOT NULL,
    "importo" DECIMAL(14,2) NOT NULL,
    "componente" TEXT NOT NULL,
    "istituto" TEXT,

    CONSTRAINT "PayrollRiga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StimaCosti" (
    "id" TEXT NOT NULL,
    "mese" TEXT NOT NULL,
    "popolazione" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "voce" TEXT NOT NULL,
    "quantita" DECIMAL(14,2),
    "tariffa" DECIMAL(14,4),
    "importo" DECIMAL(14,2) NOT NULL,
    "versioneAnagrafica" TEXT,
    "versioneParametri" TEXT,
    "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creataDa" TEXT,

    CONSTRAINT "StimaCosti_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Riconciliazione" (
    "id" TEXT NOT NULL,
    "mese" TEXT NOT NULL,
    "popolazione" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "voce" TEXT NOT NULL,
    "stima" DECIMAL(14,2) NOT NULL,
    "consuntivo" DECIMAL(14,2) NOT NULL,
    "delta" DECIMAL(14,2) NOT NULL,
    "nota" TEXT,
    "creataIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Riconciliazione_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnagraficaCDL_cf_idx" ON "AnagraficaCDL"("cf");

-- CreateIndex
CREATE UNIQUE INDEX "AnagraficaCDL_meseVersione_cf_key" ON "AnagraficaCDL"("meseVersione", "cf");

-- CreateIndex
CREATE UNIQUE INDEX "Tariffa_voce_validaDal_key" ON "Tariffa"("voce", "validaDal");

-- CreateIndex
CREATE UNIQUE INDEX "Parametro_chiave_validaDal_key" ON "Parametro"("chiave", "validaDal");

-- CreateIndex
CREATE UNIQUE INDEX "Festivo_data_station_key" ON "Festivo"("data", "station");

-- CreateIndex
CREATE INDEX "AditRiga_meseFattura_station_idx" ON "AditRiga"("meseFattura", "station");

-- CreateIndex
CREATE INDEX "PayrollRiga_mesePaga_station_idx" ON "PayrollRiga"("mesePaga", "station");

-- CreateIndex
CREATE INDEX "StimaCosti_mese_popolazione_idx" ON "StimaCosti"("mese", "popolazione");

-- CreateIndex
CREATE INDEX "Riconciliazione_mese_popolazione_idx" ON "Riconciliazione"("mese", "popolazione");


-- Seed: tariffe trasferta, parametri SIC/STD, tetto settimanale, festivi 2026–2028
INSERT INTO "Tariffa" ("id","voce","validaDal","valore","fonte") VALUES (md5(random()::text),'TRASFERTA','2025-05-01',20.5,'CCNL / accordo') ON CONFLICT DO NOTHING;
INSERT INTO "Tariffa" ("id","voce","validaDal","valore","fonte") VALUES (md5(random()::text),'TRASFERTA','2026-01-01',22.5,'CCNL / accordo') ON CONFLICT DO NOTHING;
INSERT INTO "Tariffa" ("id","voce","validaDal","valore","fonte") VALUES (md5(random()::text),'TRASFERTA','2027-01-01',23.5,'CCNL / accordo') ON CONFLICT DO NOTHING;
INSERT INTO "Tariffa" ("id","voce","validaDal","valore","fonte") VALUES (md5(random()::text),'TRASFERTA','2027-06-01',24,'CCNL / accordo') ON CONFLICT DO NOTHING;
INSERT INTO "Tariffa" ("id","voce","validaDal","valore","fonte") VALUES (md5(random()::text),'TRASFERTA_DOM_EXTRA','2025-05-01',7,'CCNL / accordo') ON CONFLICT DO NOTHING;
INSERT INTO "Parametro" ("id","chiave","validaDal","valore","fonte","note") VALUES (md5(random()::text),'SIC_MOLT_ONERI','2026-01-01',1.434,'iniziale','oneri 36,0% + TFR 7,4%') ON CONFLICT DO NOTHING;
INSERT INTO "Parametro" ("id","chiave","validaDal","valore","fonte","note") VALUES (md5(random()::text),'SIC_STR_FT','2026-01-01',17.9,'iniziale','€/h straordinario FT') ON CONFLICT DO NOTHING;
INSERT INTO "Parametro" ("id","chiave","validaDal","valore","fonte","note") VALUES (md5(random()::text),'SIC_STR_PT','2026-01-01',16.1,'iniziale','€/h straordinario PT') ON CONFLICT DO NOTHING;
INSERT INTO "Parametro" ("id","chiave","validaDal","valore","fonte","note") VALUES (md5(random()::text),'SIC_SUPP','2026-01-01',14.1,'iniziale','€/h supplementare') ON CONFLICT DO NOTHING;
INSERT INTO "Parametro" ("id","chiave","validaDal","valore","fonte","note") VALUES (md5(random()::text),'SIC_DOMFEST','2026-01-01',4.6,'iniziale','€/h lavoro domenica/festivo') ON CONFLICT DO NOTHING;
INSERT INTO "Parametro" ("id","chiave","validaDal","valore","fonte","note") VALUES (md5(random()::text),'SIC_MALATTIA_H','2026-01-01',-9.5,'iniziale','€/h ora di malattia') ON CONFLICT DO NOTHING;
INSERT INTO "Parametro" ("id","chiave","validaDal","valore","fonte","note") VALUES (md5(random()::text),'SIC_CARENZA_PCT','2026-01-01',0.025,'iniziale','carenza/integrazione su totale malattia') ON CONFLICT DO NOTHING;
INSERT INTO "Parametro" ("id","chiave","validaDal","valore","fonte","note") VALUES (md5(random()::text),'STD_CTRB_H','2026-01-01',0.1,'iniziale','CTRB Decr. Dignità €/h') ON CONFLICT DO NOTHING;
INSERT INTO "Parametro" ("id","chiave","validaDal","valore","fonte","note") VALUES (md5(random()::text),'STD_ALTRO_PCT','2026-01-01',0.002,'iniziale','altro su costo') ON CONFLICT DO NOTHING;
INSERT INTO "Parametro" ("id","chiave","validaDal","valore","fonte","note") VALUES (md5(random()::text),'STD_GG_MESE','2026-01-01',26,'iniziale','giorni convenzionali per la festività') ON CONFLICT DO NOTHING;
INSERT INTO "Parametro" ("id","chiave","validaDal","valore","fonte","note") VALUES (md5(random()::text),'STD_MOG','2026-01-01',0,'iniziale','integrazione MOG') ON CONFLICT DO NOTHING;
INSERT INTO "Parametro" ("id","chiave","validaDal","valore","fonte","note") VALUES (md5(random()::text),'TETTO_SETT_H','2025-01-01',43,'iniziale','CCNL art. 11 quinquies') ON CONFLICT DO NOTHING;
INSERT INTO "Parametro" ("id","chiave","validaDal","valore","fonte","note") VALUES (md5(random()::text),'TETTO_SETT_H','2026-06-01',42,'iniziale','CCNL art. 11 quinquies') ON CONFLICT DO NOTHING;
INSERT INTO "Parametro" ("id","chiave","validaDal","valore","fonte","note") VALUES (md5(random()::text),'TETTO_SETT_H','2027-07-01',41,'iniziale','CCNL art. 11 quinquies') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-01-01','Nazionale: Capodanno','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-01-06','Nazionale: Epifania','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-04-06','Nazionale: Lunedì dell''Angelo','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-04-25','Nazionale: Liberazione','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-05-01','Nazionale: Festa del lavoro','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-05-10','Patrono','DLO5') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-06-02','Nazionale: Festa della Repubblica','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-07-11','Patrono','DLZ2') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-07-20','Patrono','DVN1') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-08-15','Nazionale: Ferragosto','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-09-13','Patrono','DLO2') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-09-20','Patrono','DLO4') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-09-29','Patrono','DER2') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-10-11','Patrono','DER1') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-11-01','Nazionale: Ognissanti','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-12-08','Nazionale: Immacolata','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-12-24','Semifestivo (art. 10 Accordo)','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-12-25','Nazionale: Natale','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-12-26','Nazionale: Santo Stefano','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2026-12-31','Semifestivo (art. 10 Accordo)','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-01-01','Nazionale: Capodanno','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-01-06','Nazionale: Epifania','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-03-29','Nazionale: Lunedì dell''Angelo','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-04-25','Nazionale: Liberazione','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-05-01','Nazionale: Festa del lavoro','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-05-09','Patrono','DLO5') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-06-02','Nazionale: Festa della Repubblica','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-07-11','Patrono','DLZ2') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-07-20','Patrono','DVN1') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-08-15','Nazionale: Ferragosto','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-09-12','Patrono','DLO2') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-09-19','Patrono','DLO4') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-09-29','Patrono','DER2') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-10-11','Patrono','DER1') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-11-01','Nazionale: Ognissanti','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-12-08','Nazionale: Immacolata','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-12-24','Semifestivo (art. 10 Accordo)','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-12-25','Nazionale: Natale','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-12-26','Nazionale: Santo Stefano','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2027-12-31','Semifestivo (art. 10 Accordo)','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-01-01','Nazionale: Capodanno','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-01-06','Nazionale: Epifania','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-04-17','Nazionale: Lunedì dell''Angelo','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-04-25','Nazionale: Liberazione','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-05-01','Nazionale: Festa del lavoro','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-05-14','Patrono','DLO5') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-06-02','Nazionale: Festa della Repubblica','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-07-11','Patrono','DLZ2') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-07-20','Patrono','DVN1') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-08-15','Nazionale: Ferragosto','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-09-10','Patrono','DLO2') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-09-17','Patrono','DLO4') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-09-29','Patrono','DER2') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-10-11','Patrono','DER1') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-11-01','Nazionale: Ognissanti','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-12-08','Nazionale: Immacolata','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-12-24','Semifestivo (art. 10 Accordo)','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-12-25','Nazionale: Natale','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-12-26','Nazionale: Santo Stefano','TUTTE') ON CONFLICT DO NOTHING;
INSERT INTO "Festivo" ("id","data","descrizione","station") VALUES (md5(random()::text),'2028-12-31','Semifestivo (art. 10 Accordo)','TUTTE') ON CONFLICT DO NOTHING;
