-- AlterTable
ALTER TABLE "DecisionProposal" ADD COLUMN     "meetingId" INTEGER;

-- AlterTable
ALTER TABLE "DecisionVoteRound" ADD COLUMN     "meetingId" INTEGER;

-- CreateIndex
CREATE INDEX "DecisionProposal_meetingId_idx" ON "DecisionProposal"("meetingId");

-- CreateIndex
CREATE INDEX "DecisionVoteRound_meetingId_idx" ON "DecisionVoteRound"("meetingId");

-- AddForeignKey
ALTER TABLE "DecisionProposal" ADD CONSTRAINT "DecisionProposal_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "MeetingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionVoteRound" ADD CONSTRAINT "DecisionVoteRound_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "MeetingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
