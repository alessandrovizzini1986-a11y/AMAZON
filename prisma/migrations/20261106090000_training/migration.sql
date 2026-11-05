-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'STAGISTA';

-- CreateTable
CREATE TABLE "TrainingProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "note" TEXT,
    "validatedBy" TEXT,
    "validatedAt" TIMESTAMP(3),

    CONSTRAINT "TrainingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingExtra" (
    "id" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "chi" TEXT NOT NULL,
    "durata" INTEGER NOT NULL,
    "testo" TEXT NOT NULL,
    "sezioni" TEXT[],
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingExtra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingProgress_userId_activityId_key" ON "TrainingProgress"("userId", "activityId");

-- CreateIndex
CREATE INDEX "TrainingProgress_userId_idx" ON "TrainingProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingNote_userId_day_key" ON "TrainingNote"("userId", "day");

-- CreateIndex
CREATE INDEX "TrainingExtra_day_idx" ON "TrainingExtra"("day");
