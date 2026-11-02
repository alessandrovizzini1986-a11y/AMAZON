-- Ruolo CONTROLLO (stagista controlli presenze)
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CONTROLLO';

-- CreateTable
CREATE TABLE "PresenzeDispatcher" (
    "id" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "station" TEXT,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PresenzeDispatcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresenzeGiustificativo" (
    "codice" TEXT NOT NULL,
    "descrizione" TEXT NOT NULL DEFAULT '',
    "attivo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PresenzeGiustificativo_pkey" PRIMARY KEY ("codice")
);

-- CreateTable
CREATE TABLE "PresenzeReferente" (
    "station" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "PresenzeReferente_pkey" PRIMARY KEY ("station")
);

-- CreateIndex
CREATE UNIQUE INDEX "PresenzeDispatcher_cognome_nome_key" ON "PresenzeDispatcher"("cognome", "nome");

-- Valori iniziali dal kit (regole/dispatcher.csv)
INSERT INTO "PresenzeDispatcher" ("id", "cognome", "nome") VALUES
    ('kit_disp_01', 'LEONARDI', 'ANDREA'),
    ('kit_disp_02', 'BRUNO', 'DOMENICO'),
    ('kit_disp_03', 'GIURIATO', 'FEDERICO'),
    ('kit_disp_04', 'CUOCO', 'PAOLO'),
    ('kit_disp_05', 'MITROI', 'RAZVAN FLORIN'),
    ('kit_disp_06', 'CAGNIN', 'ALBERTO'),
    ('kit_disp_07', 'BELLIATO', 'DAVIDE'),
    ('kit_disp_08', 'HALILAJ', 'KLODIAN'),
    ('kit_disp_09', 'CARRETTA', 'MARCO'),
    ('kit_disp_10', 'HATILLARI', 'MATEO'),
    ('kit_disp_11', 'SARTI', 'PAMELA'),
    ('kit_disp_12', 'VASSELLATTI', 'GABRIELE OTTAVIANO'),
    ('kit_disp_13', 'DI CARLO', 'GIOVANNI'),
    ('kit_disp_14', 'TUESTA GARCIA', 'JULIUS AMADEUS'),
    ('kit_disp_15', 'CUONZO', 'SILVIO'),
    ('kit_disp_16', 'GOTTI', 'ALESSANDRO'),
    ('kit_disp_17', 'ASHIQ', 'ALI'),
    ('kit_disp_18', 'MANCA', 'PIETRO'),
    ('kit_disp_19', 'LAZZARINI', 'THOMAS'),
    ('kit_disp_20', 'MATRANGA', 'VINCENZO'),
    ('kit_disp_21', 'CHIANELLA', 'DAMIANO'),
    ('kit_disp_22', 'FLORIS', 'FABIO'),
    ('kit_disp_23', 'SALLUSTIO', 'MARCO'),
    ('kit_disp_24', 'GUIDI', 'SIMONE'),
    ('kit_disp_25', 'VENTURINI', 'ADRIANO'),
    ('kit_disp_26', 'MIOTTO', 'LUCA'),
    ('kit_disp_27', 'BIASIN', 'MATTEO'),
    ('kit_disp_28', 'VIZZINI', 'ALESSANDRO')
ON CONFLICT DO NOTHING;

-- Valori iniziali dal kit (regole/giustificativi.csv + sigle e città delle station)
INSERT INTO "PresenzeGiustificativo" ("codice", "descrizione") VALUES
    ('MEZZI', 'spostamento mezzi'),
    ('SM', 'spostamento mezzi'),
    ('UFF', 'ufficio'),
    ('UFFICIO', 'ufficio'),
    ('CORSO', 'formazione'),
    ('FORMAZIONE', 'formazione'),
    ('RESCUE', 'rescue (trasferta dovuta)'),
    ('VM', 'visita medica'),
    ('DVN5', 'prestito altra station'),
    ('DVN6', 'prestito altra station'),
    ('DER1', 'prestito altra station'),
    ('DER2', 'prestito altra station'),
    ('DLO2', 'prestito altra station'),
    ('DLO4', 'prestito altra station'),
    ('DLO5', 'prestito altra station'),
    ('DLZ2', 'prestito altra station'),
    ('DVN1', 'prestito altra station'),
    ('VALSAMOGGIA', 'prestito altra station'),
    ('SANTARCANGELO', 'prestito altra station'),
    ('ORIGGIO', 'prestito altra station'),
    ('BUCCINASCO', 'prestito altra station'),
    ('CASTEGNATO', 'prestito altra station'),
    ('POMEZIA', 'prestito altra station'),
    ('VIGONZA', 'prestito altra station')
ON CONFLICT DO NOTHING;
