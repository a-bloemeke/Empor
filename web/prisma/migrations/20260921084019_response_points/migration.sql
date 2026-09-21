-- AlterTable
ALTER TABLE "PlayerStats" ADD COLUMN     "responsePoints" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PlayerStatsLifetime" ADD COLUMN     "responsePoints" INTEGER NOT NULL DEFAULT 0;
