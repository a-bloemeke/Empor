-- AlterTable
ALTER TABLE "PlayerStats" ADD COLUMN     "beers" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PlayerStatsLifetime" ADD COLUMN     "beers" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SessionRegistration" ADD COLUMN     "beerBringer" BOOLEAN NOT NULL DEFAULT false;
