-- CreateEnum
CREATE TYPE "MeetingKind" AS ENUM ('QUICK_CALL', 'APPOINTMENT');

-- CreateEnum
CREATE TYPE "MeetingMediaMode" AS ENUM ('AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "MeetingInvitationStatus" AS ENUM ('INVITED', 'ACCEPTED', 'DECLINED', 'MISSED');

-- CreateEnum
CREATE TYPE "MeetingPresenceEventType" AS ENUM ('JOINED', 'LEFT', 'CONNECTION_ABORTED');

-- AlterEnum
ALTER TYPE "MeetingStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "MeetingParticipant" ADD COLUMN     "invitationStatus" "MeetingInvitationStatus",
ADD COLUMN     "respondedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MeetingSession" ADD COLUMN     "kind" "MeetingKind" NOT NULL DEFAULT 'APPOINTMENT',
ADD COLUMN     "mediaMode" "MeetingMediaMode" NOT NULL DEFAULT 'VIDEO',
ADD COLUMN     "ringExpiresAt" TIMESTAMP(3),
ALTER COLUMN "areaId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "MeetingPresenceEvent" (
    "id" SERIAL NOT NULL,
    "meetingId" INTEGER NOT NULL,
    "userId" INTEGER,
    "type" "MeetingPresenceEventType" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingPresenceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingPresenceEvent_providerEventId_key" ON "MeetingPresenceEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "MeetingPresenceEvent_meetingId_occurredAt_idx" ON "MeetingPresenceEvent"("meetingId", "occurredAt");

-- CreateIndex
CREATE INDEX "MeetingPresenceEvent_userId_occurredAt_idx" ON "MeetingPresenceEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "MeetingPresenceEvent_type_idx" ON "MeetingPresenceEvent"("type");

-- CreateIndex
CREATE INDEX "MeetingParticipant_invitationStatus_idx" ON "MeetingParticipant"("invitationStatus");

-- AddForeignKey
ALTER TABLE "MeetingPresenceEvent" ADD CONSTRAINT "MeetingPresenceEvent_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "MeetingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingPresenceEvent" ADD CONSTRAINT "MeetingPresenceEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
