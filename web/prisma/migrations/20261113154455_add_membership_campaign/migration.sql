-- CreateEnum
CREATE TYPE "FeeIntent" AS ENUM ('CONFIRMED', 'DECLINED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- AlterTable
ALTER TABLE "MembershipFee" ADD COLUMN     "intentAt" TIMESTAMP(3),
ADD COLUMN     "playerIntent" "FeeIntent",
ADD COLUMN     "reminderLastSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MembershipCampaign" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "bankName" TEXT,
    "iban" TEXT,
    "bic" TEXT,
    "paypalHandle" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastInvitationSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MembershipCampaign_year_key" ON "MembershipCampaign"("year");
