-- CreateEnum
CREATE TYPE "ResolutionKind" AS ENUM ('INTERIM', 'FINAL', 'SUPPLEMENT');

-- CreateEnum
CREATE TYPE "ResolutionStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'REVOKED');

-- AlterTable
ALTER TABLE "DecisionTask" ADD COLUMN     "resolutionId" INTEGER;

-- CreateTable
CREATE TABLE "DecisionResolution" (
    "id" SERIAL NOT NULL,
    "decisionId" INTEGER NOT NULL,
    "sourceProposalId" INTEGER,
    "sourceVoteRoundId" INTEGER,
    "meetingId" INTEGER,
    "decidedById" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "kind" "ResolutionKind" NOT NULL DEFAULT 'FINAL',
    "status" "ResolutionStatus" NOT NULL DEFAULT 'ACTIVE',
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionResolution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DecisionResolution_decisionId_idx" ON "DecisionResolution"("decisionId");

-- CreateIndex
CREATE INDEX "DecisionResolution_sourceProposalId_idx" ON "DecisionResolution"("sourceProposalId");

-- CreateIndex
CREATE INDEX "DecisionResolution_sourceVoteRoundId_idx" ON "DecisionResolution"("sourceVoteRoundId");

-- CreateIndex
CREATE INDEX "DecisionResolution_meetingId_idx" ON "DecisionResolution"("meetingId");

-- CreateIndex
CREATE INDEX "DecisionResolution_decidedById_idx" ON "DecisionResolution"("decidedById");

-- CreateIndex
CREATE INDEX "DecisionResolution_kind_idx" ON "DecisionResolution"("kind");

-- CreateIndex
CREATE INDEX "DecisionResolution_status_idx" ON "DecisionResolution"("status");

-- CreateIndex
CREATE INDEX "DecisionResolution_decidedAt_idx" ON "DecisionResolution"("decidedAt");

-- CreateIndex
CREATE INDEX "DecisionTask_resolutionId_idx" ON "DecisionTask"("resolutionId");

-- AddForeignKey
ALTER TABLE "DecisionResolution" ADD CONSTRAINT "DecisionResolution_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionResolution" ADD CONSTRAINT "DecisionResolution_sourceProposalId_fkey" FOREIGN KEY ("sourceProposalId") REFERENCES "DecisionProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionResolution" ADD CONSTRAINT "DecisionResolution_sourceVoteRoundId_fkey" FOREIGN KEY ("sourceVoteRoundId") REFERENCES "DecisionVoteRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionResolution" ADD CONSTRAINT "DecisionResolution_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "MeetingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionResolution" ADD CONSTRAINT "DecisionResolution_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionTask" ADD CONSTRAINT "DecisionTask_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "DecisionResolution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
