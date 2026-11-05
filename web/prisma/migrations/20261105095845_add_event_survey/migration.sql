-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "EventQuestionType" AS ENUM ('SINGLE_CHOICE');

-- CreateEnum
CREATE TYPE "EventAvailability" AS ENUM ('YES', 'NO', 'MAYBE');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventDateOption" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventDateOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventQuestion" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "EventQuestionType" NOT NULL DEFAULT 'SINGLE_CHOICE',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventQuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "allowFreeText" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EventQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventResponse" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventDateVote" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "dateOptionId" TEXT NOT NULL,
    "availability" "EventAvailability" NOT NULL,

    CONSTRAINT "EventDateVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionId" TEXT,
    "freeText" TEXT,

    CONSTRAINT "EventAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventResponse_eventId_playerId_key" ON "EventResponse"("eventId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "EventDateVote_responseId_dateOptionId_key" ON "EventDateVote"("responseId", "dateOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "EventAnswer_responseId_questionId_key" ON "EventAnswer"("responseId", "questionId");

-- AddForeignKey
ALTER TABLE "EventDateOption" ADD CONSTRAINT "EventDateOption_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventQuestion" ADD CONSTRAINT "EventQuestion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventQuestionOption" ADD CONSTRAINT "EventQuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "EventQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventResponse" ADD CONSTRAINT "EventResponse_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventResponse" ADD CONSTRAINT "EventResponse_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDateVote" ADD CONSTRAINT "EventDateVote_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "EventResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDateVote" ADD CONSTRAINT "EventDateVote_dateOptionId_fkey" FOREIGN KEY ("dateOptionId") REFERENCES "EventDateOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAnswer" ADD CONSTRAINT "EventAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "EventResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAnswer" ADD CONSTRAINT "EventAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "EventQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAnswer" ADD CONSTRAINT "EventAnswer_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "EventQuestionOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
