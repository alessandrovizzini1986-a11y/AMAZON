CREATE TABLE "CorsoProgresso" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lezione" TEXT NOT NULL,
    "tentativi" INTEGER NOT NULL DEFAULT 0,
    "superataIl" TIMESTAMP(3),
    "ultimoIl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CorsoProgresso_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CorsoProgresso_userId_lezione_key" ON "CorsoProgresso"("userId", "lezione");
CREATE INDEX "CorsoProgresso_userId_idx" ON "CorsoProgresso"("userId");
