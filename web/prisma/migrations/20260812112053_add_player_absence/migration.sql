-- CreateTable
CREATE TABLE "PlayerAbsence" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerAbsence_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PlayerAbsence" ADD CONSTRAINT "PlayerAbsence_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
