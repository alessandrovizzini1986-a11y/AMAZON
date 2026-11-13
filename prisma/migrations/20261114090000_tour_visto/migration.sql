-- Tour di benvenuto: chi l'ha già fatto (o ha scelto di non vederlo), per utente e per chiave (versione + ruolo).
CREATE TABLE "TourVisto" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chiave" TEXT NOT NULL,
    "esito" TEXT NOT NULL,
    "il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TourVisto_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TourVisto_userId_chiave_key" ON "TourVisto"("userId", "chiave");
ALTER TABLE "TourVisto" ADD CONSTRAINT "TourVisto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
