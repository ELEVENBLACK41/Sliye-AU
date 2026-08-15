/*
  Warnings:

  - You are about to drop the `DecisionVote` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "VoteRoundStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VoteMethod" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'APPROVAL');

-- DropForeignKey
ALTER TABLE "DecisionVote" DROP CONSTRAINT "DecisionVote_proposalId_fkey";

-- DropForeignKey
ALTER TABLE "DecisionVote" DROP CONSTRAINT "DecisionVote_voterId_fkey";

-- DropTable
DROP TABLE "DecisionVote";

-- DropEnum
DROP TYPE "VoteOption";

-- CreateTable
CREATE TABLE "DecisionVoteRound" (
    "id" SERIAL NOT NULL,
    "decisionId" INTEGER NOT NULL,
    "creatorId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "method" "VoteMethod" NOT NULL,
    "status" "VoteRoundStatus" NOT NULL DEFAULT 'DRAFT',
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "quorumCount" INTEGER,
    "maxChoices" INTEGER,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionVoteRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionVoteOption" (
    "id" SERIAL NOT NULL,
    "roundId" INTEGER NOT NULL,
    "proposalId" INTEGER,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionVoteOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionBallot" (
    "id" SERIAL NOT NULL,
    "roundId" INTEGER NOT NULL,
    "voterId" INTEGER NOT NULL,
    "reason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionBallot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionBallotChoice" (
    "roundId" INTEGER NOT NULL,
    "ballotId" INTEGER NOT NULL,
    "optionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionBallotChoice_pkey" PRIMARY KEY ("roundId","ballotId","optionId")
);

-- CreateIndex
CREATE INDEX "DecisionVoteRound_decisionId_idx" ON "DecisionVoteRound"("decisionId");

-- CreateIndex
CREATE INDEX "DecisionVoteRound_creatorId_idx" ON "DecisionVoteRound"("creatorId");

-- CreateIndex
CREATE INDEX "DecisionVoteRound_status_idx" ON "DecisionVoteRound"("status");

-- CreateIndex
CREATE INDEX "DecisionVoteRound_createdAt_idx" ON "DecisionVoteRound"("createdAt");

-- CreateIndex
CREATE INDEX "DecisionVoteOption_proposalId_idx" ON "DecisionVoteOption"("proposalId");

-- CreateIndex
CREATE INDEX "DecisionVoteOption_roundId_sortOrder_idx" ON "DecisionVoteOption"("roundId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionVoteOption_roundId_code_key" ON "DecisionVoteOption"("roundId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionVoteOption_id_roundId_key" ON "DecisionVoteOption"("id", "roundId");

-- CreateIndex
CREATE INDEX "DecisionBallot_voterId_idx" ON "DecisionBallot"("voterId");

-- CreateIndex
CREATE INDEX "DecisionBallot_submittedAt_idx" ON "DecisionBallot"("submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionBallot_roundId_voterId_key" ON "DecisionBallot"("roundId", "voterId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionBallot_id_roundId_key" ON "DecisionBallot"("id", "roundId");

-- CreateIndex
CREATE INDEX "DecisionBallotChoice_ballotId_roundId_idx" ON "DecisionBallotChoice"("ballotId", "roundId");

-- CreateIndex
CREATE INDEX "DecisionBallotChoice_optionId_roundId_idx" ON "DecisionBallotChoice"("optionId", "roundId");

-- AddForeignKey
ALTER TABLE "DecisionVoteRound" ADD CONSTRAINT "DecisionVoteRound_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionVoteRound" ADD CONSTRAINT "DecisionVoteRound_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionVoteOption" ADD CONSTRAINT "DecisionVoteOption_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "DecisionVoteRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionVoteOption" ADD CONSTRAINT "DecisionVoteOption_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "DecisionProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionBallot" ADD CONSTRAINT "DecisionBallot_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "DecisionVoteRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionBallot" ADD CONSTRAINT "DecisionBallot_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionBallotChoice" ADD CONSTRAINT "DecisionBallotChoice_ballotId_roundId_fkey" FOREIGN KEY ("ballotId", "roundId") REFERENCES "DecisionBallot"("id", "roundId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionBallotChoice" ADD CONSTRAINT "DecisionBallotChoice_optionId_roundId_fkey" FOREIGN KEY ("optionId", "roundId") REFERENCES "DecisionVoteOption"("id", "roundId") ON DELETE CASCADE ON UPDATE CASCADE;
