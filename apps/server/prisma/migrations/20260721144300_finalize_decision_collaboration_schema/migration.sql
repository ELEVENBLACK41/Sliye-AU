-- CreateEnum
CREATE TYPE "DiscussionSpaceStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DiscussionSpaceMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "DiscussionMessageType" AS ENUM ('TEXT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MeetingMode" AS ENUM ('AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "MeetingParticipantRole" AS ENUM ('HOST', 'CO_HOST', 'ATTENDEE');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('PENDING', 'RECORDING', 'PROCESSING', 'READY', 'FAILED');

-- AlterEnum
BEGIN;
CREATE TYPE "DecisionEventType_new" AS ENUM ('DECISION_CREATED', 'DECISION_UPDATED', 'STATUS_CHANGED', 'PARTICIPANT_ADDED', 'PARTICIPANT_REMOVED', 'PROPOSAL_CREATED', 'PROPOSAL_UPDATED', 'VOTE_ROUND_CREATED', 'VOTE_ROUND_OPENED', 'VOTE_ROUND_CLOSED', 'VOTE_CAST', 'RESOLUTION_CREATED', 'RESOLUTION_SUPERSEDED', 'RESOLUTION_REVOKED', 'TASK_CREATED', 'TASK_UPDATED', 'SPACE_LINKED', 'MESSAGE_PINNED', 'MEETING_STARTED', 'MEETING_ENDED', 'RECORDING_READY', 'AI_SUMMARY_CREATED');
ALTER TABLE "DecisionEvent" ALTER COLUMN "type" TYPE "DecisionEventType_new" USING ("type"::text::"DecisionEventType_new");
ALTER TYPE "DecisionEventType" RENAME TO "DecisionEventType_old";
ALTER TYPE "DecisionEventType_new" RENAME TO "DecisionEventType";
DROP TYPE "public"."DecisionEventType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "DecisionStatus_new" AS ENUM ('DRAFT', 'DISCUSSING', 'RESOLVED', 'ARCHIVED');
ALTER TABLE "public"."Decision" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Decision" ALTER COLUMN "status" TYPE "DecisionStatus_new" USING ("status"::text::"DecisionStatus_new");
ALTER TYPE "DecisionStatus" RENAME TO "DecisionStatus_old";
ALTER TYPE "DecisionStatus_new" RENAME TO "DecisionStatus";
DROP TYPE "public"."DecisionStatus_old";
ALTER TABLE "Decision" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- DropForeignKey
ALTER TABLE "MeetingSession" DROP CONSTRAINT "MeetingSession_decisionId_fkey";

-- DropIndex
DROP INDEX "MeetingSession_decisionId_idx";

-- AlterTable
ALTER TABLE "Decision" ADD COLUMN     "spaceId" INTEGER;

-- AlterTable
ALTER TABLE "DecisionEvent" ADD COLUMN     "messageId" INTEGER,
ADD COLUMN     "recordingId" INTEGER,
ADD COLUMN     "resolutionId" INTEGER,
ADD COLUMN     "voteRoundId" INTEGER;

-- AlterTable
ALTER TABLE "DecisionResolution" ADD COLUMN     "supersedesId" INTEGER;

-- AlterTable
ALTER TABLE "MeetingParticipant" ADD COLUMN     "role" "MeetingParticipantRole" NOT NULL DEFAULT 'ATTENDEE';

-- AlterTable
ALTER TABLE "MeetingSession" DROP COLUMN "decisionId",
ADD COLUMN     "createdById" INTEGER NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "mode" "MeetingMode" NOT NULL,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerRoomId" TEXT,
ADD COLUMN     "roomKey" TEXT NOT NULL,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "spaceId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "DiscussionSpace" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "DiscussionSpaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscussionSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscussionSpaceMember" (
    "spaceId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "DiscussionSpaceMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscussionSpaceMember_pkey" PRIMARY KEY ("spaceId","userId")
);

-- CreateTable
CREATE TABLE "DiscussionMessage" (
    "id" SERIAL NOT NULL,
    "spaceId" INTEGER NOT NULL,
    "authorId" INTEGER,
    "decisionId" INTEGER,
    "meetingId" INTEGER,
    "replyToId" INTEGER,
    "pinnedById" INTEGER,
    "type" "DiscussionMessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscussionMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingDecision" (
    "meetingId" INTEGER NOT NULL,
    "decisionId" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingDecision_pkey" PRIMARY KEY ("meetingId","decisionId")
);

-- CreateTable
CREATE TABLE "MeetingRecording" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "providerAssetId" TEXT,
    "storageKey" TEXT,
    "durationMs" INTEGER,
    "status" "RecordingStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingRecording_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscussionSpace_createdById_idx" ON "DiscussionSpace"("createdById");

-- CreateIndex
CREATE INDEX "DiscussionSpace_status_idx" ON "DiscussionSpace"("status");

-- CreateIndex
CREATE INDEX "DiscussionSpace_createdAt_idx" ON "DiscussionSpace"("createdAt");

-- CreateIndex
CREATE INDEX "DiscussionSpaceMember_userId_idx" ON "DiscussionSpaceMember"("userId");

-- CreateIndex
CREATE INDEX "DiscussionSpaceMember_role_idx" ON "DiscussionSpaceMember"("role");

-- CreateIndex
CREATE INDEX "DiscussionMessage_spaceId_createdAt_idx" ON "DiscussionMessage"("spaceId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscussionMessage_authorId_idx" ON "DiscussionMessage"("authorId");

-- CreateIndex
CREATE INDEX "DiscussionMessage_decisionId_idx" ON "DiscussionMessage"("decisionId");

-- CreateIndex
CREATE INDEX "DiscussionMessage_meetingId_idx" ON "DiscussionMessage"("meetingId");

-- CreateIndex
CREATE INDEX "DiscussionMessage_replyToId_idx" ON "DiscussionMessage"("replyToId");

-- CreateIndex
CREATE INDEX "DiscussionMessage_pinnedById_idx" ON "DiscussionMessage"("pinnedById");

-- CreateIndex
CREATE INDEX "DiscussionMessage_type_idx" ON "DiscussionMessage"("type");

-- CreateIndex
CREATE INDEX "MeetingDecision_decisionId_idx" ON "MeetingDecision"("decisionId");

-- CreateIndex
CREATE INDEX "MeetingRecording_meetingId_status_idx" ON "MeetingRecording"("meetingId", "status");

-- CreateIndex
CREATE INDEX "MeetingRecording_createdAt_idx" ON "MeetingRecording"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingRecording_meetingId_providerAssetId_key" ON "MeetingRecording"("meetingId", "providerAssetId");

-- CreateIndex
CREATE INDEX "Decision_spaceId_idx" ON "Decision"("spaceId");

-- CreateIndex
CREATE INDEX "DecisionEvent_voteRoundId_idx" ON "DecisionEvent"("voteRoundId");

-- CreateIndex
CREATE INDEX "DecisionEvent_resolutionId_idx" ON "DecisionEvent"("resolutionId");

-- CreateIndex
CREATE INDEX "DecisionEvent_recordingId_idx" ON "DecisionEvent"("recordingId");

-- CreateIndex
CREATE INDEX "DecisionEvent_messageId_idx" ON "DecisionEvent"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionResolution_supersedesId_key" ON "DecisionResolution"("supersedesId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_role_idx" ON "MeetingParticipant"("role");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingSession_roomKey_key" ON "MeetingSession"("roomKey");

-- CreateIndex
CREATE INDEX "MeetingSession_spaceId_idx" ON "MeetingSession"("spaceId");

-- CreateIndex
CREATE INDEX "MeetingSession_createdById_idx" ON "MeetingSession"("createdById");

-- CreateIndex
CREATE INDEX "MeetingSession_scheduledAt_idx" ON "MeetingSession"("scheduledAt");

-- CreateIndex
CREATE INDEX "MeetingSession_createdAt_idx" ON "MeetingSession"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingSession_provider_providerRoomId_key" ON "MeetingSession"("provider", "providerRoomId");

-- AddForeignKey
ALTER TABLE "DiscussionSpace" ADD CONSTRAINT "DiscussionSpace_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionSpaceMember" ADD CONSTRAINT "DiscussionSpaceMember_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "DiscussionSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionSpaceMember" ADD CONSTRAINT "DiscussionSpaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionMessage" ADD CONSTRAINT "DiscussionMessage_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "DiscussionSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionMessage" ADD CONSTRAINT "DiscussionMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionMessage" ADD CONSTRAINT "DiscussionMessage_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionMessage" ADD CONSTRAINT "DiscussionMessage_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "MeetingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionMessage" ADD CONSTRAINT "DiscussionMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "DiscussionMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionMessage" ADD CONSTRAINT "DiscussionMessage_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "DiscussionSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionResolution" ADD CONSTRAINT "DecisionResolution_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "DecisionResolution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSession" ADD CONSTRAINT "MeetingSession_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "DiscussionSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSession" ADD CONSTRAINT "MeetingSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingDecision" ADD CONSTRAINT "MeetingDecision_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "MeetingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingDecision" ADD CONSTRAINT "MeetingDecision_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRecording" ADD CONSTRAINT "MeetingRecording_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "MeetingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionEvent" ADD CONSTRAINT "DecisionEvent_voteRoundId_fkey" FOREIGN KEY ("voteRoundId") REFERENCES "DecisionVoteRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionEvent" ADD CONSTRAINT "DecisionEvent_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "DecisionResolution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionEvent" ADD CONSTRAINT "DecisionEvent_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "MeetingRecording"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionEvent" ADD CONSTRAINT "DecisionEvent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DiscussionMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
