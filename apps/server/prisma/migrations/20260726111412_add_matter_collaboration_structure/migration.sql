/*
  Warnings:

  - You are about to drop the column `spaceId` on the `Decision` table. All the data in the column will be lost.
  - You are about to drop the column `spaceId` on the `DiscussionMessage` table. All the data in the column will be lost.
  - You are about to drop the column `spaceId` on the `MeetingSession` table. All the data in the column will be lost.
  - You are about to drop the `DiscussionSpace` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `matterId` to the `Decision` table without a default value. This is not possible if the table is not empty.
  - Added the required column `areaId` to the `DiscussionMessage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `areaId` to the `MeetingSession` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MatterStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MatterMemberRole" AS ENUM ('OWNER', 'MANAGER', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "DiscussionAreaType" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "DiscussionAreaMemberRole" AS ENUM ('MANAGER', 'MEMBER');

-- CreateEnum
CREATE TYPE "DiscussionAreaStatus" AS ENUM ('ACTIVE', 'READ_ONLY', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "DiscussionMessageType" ADD VALUE 'PUBLICATION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ResourceType" ADD VALUE 'MATTER';
ALTER TYPE "ResourceType" ADD VALUE 'DISCUSSION_AREA';

-- DropForeignKey
ALTER TABLE "Decision" DROP CONSTRAINT "Decision_spaceId_fkey";

-- DropForeignKey
ALTER TABLE "DiscussionMessage" DROP CONSTRAINT "DiscussionMessage_spaceId_fkey";

-- DropForeignKey
ALTER TABLE "DiscussionSpace" DROP CONSTRAINT "DiscussionSpace_createdById_fkey";

-- DropForeignKey
ALTER TABLE "MeetingSession" DROP CONSTRAINT "MeetingSession_spaceId_fkey";

-- DropIndex
DROP INDEX "Decision_spaceId_key";

-- DropIndex
DROP INDEX "DiscussionMessage_spaceId_createdAt_idx";

-- DropIndex
DROP INDEX "DiscussionMessage_spaceId_id_idx";

-- DropIndex
DROP INDEX "MeetingSession_spaceId_idx";

-- AlterTable
ALTER TABLE "Decision" DROP COLUMN "spaceId",
ADD COLUMN     "matterId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "DiscussionMessage" DROP COLUMN "spaceId",
ADD COLUMN     "areaId" INTEGER NOT NULL,
ADD COLUMN     "decisionId" INTEGER;

-- AlterTable
ALTER TABLE "MeetingSession" DROP COLUMN "spaceId",
ADD COLUMN     "areaId" INTEGER NOT NULL;

-- DropTable
DROP TABLE "DiscussionSpace";

-- DropEnum
DROP TYPE "DiscussionSpaceStatus";

-- CreateTable
CREATE TABLE "Matter" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "MatterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" INTEGER NOT NULL,
    "ownerId" INTEGER,
    "deptId" INTEGER NOT NULL,
    "closedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Matter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatterMember" (
    "id" SERIAL NOT NULL,
    "matterId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "MatterMemberRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatterMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscussionArea" (
    "id" SERIAL NOT NULL,
    "matterId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "DiscussionAreaType" NOT NULL DEFAULT 'PRIVATE',
    "status" "DiscussionAreaStatus" NOT NULL DEFAULT 'ACTIVE',
    "publicKey" TEXT,
    "closedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscussionArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscussionAreaMember" (
    "id" SERIAL NOT NULL,
    "areaId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" "DiscussionAreaMemberRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscussionAreaMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscussionPublication" (
    "id" SERIAL NOT NULL,
    "sourceAreaId" INTEGER NOT NULL,
    "targetAreaId" INTEGER NOT NULL,
    "publishedMessageId" INTEGER NOT NULL,
    "publishedById" INTEGER NOT NULL,
    "decisionId" INTEGER,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscussionPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscussionPublicationSource" (
    "publicationId" INTEGER NOT NULL,
    "messageId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscussionPublicationSource_pkey" PRIMARY KEY ("publicationId","messageId")
);

-- CreateTable
CREATE TABLE "CollaborationAuditLog" (
    "id" SERIAL NOT NULL,
    "actorId" INTEGER NOT NULL,
    "matterId" INTEGER NOT NULL,
    "areaId" INTEGER,
    "meetingId" INTEGER,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollaborationAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingDecision" (
    "meetingId" INTEGER NOT NULL,
    "decisionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingDecision_pkey" PRIMARY KEY ("meetingId","decisionId")
);

-- CreateIndex
CREATE INDEX "Matter_createdById_idx" ON "Matter"("createdById");

-- CreateIndex
CREATE INDEX "Matter_ownerId_idx" ON "Matter"("ownerId");

-- CreateIndex
CREATE INDEX "Matter_deptId_idx" ON "Matter"("deptId");

-- CreateIndex
CREATE INDEX "Matter_status_idx" ON "Matter"("status");

-- CreateIndex
CREATE INDEX "Matter_createdAt_idx" ON "Matter"("createdAt");

-- CreateIndex
CREATE INDEX "MatterMember_userId_idx" ON "MatterMember"("userId");

-- CreateIndex
CREATE INDEX "MatterMember_role_idx" ON "MatterMember"("role");

-- CreateIndex
CREATE UNIQUE INDEX "MatterMember_matterId_userId_key" ON "MatterMember"("matterId", "userId");

-- CreateIndex
CREATE INDEX "DiscussionArea_matterId_type_idx" ON "DiscussionArea"("matterId", "type");

-- CreateIndex
CREATE INDEX "DiscussionArea_createdById_idx" ON "DiscussionArea"("createdById");

-- CreateIndex
CREATE INDEX "DiscussionArea_status_idx" ON "DiscussionArea"("status");

-- CreateIndex
CREATE INDEX "DiscussionArea_createdAt_idx" ON "DiscussionArea"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiscussionArea_matterId_publicKey_key" ON "DiscussionArea"("matterId", "publicKey");

-- CreateIndex
CREATE INDEX "DiscussionAreaMember_userId_idx" ON "DiscussionAreaMember"("userId");

-- CreateIndex
CREATE INDEX "DiscussionAreaMember_role_idx" ON "DiscussionAreaMember"("role");

-- CreateIndex
CREATE UNIQUE INDEX "DiscussionAreaMember_areaId_userId_key" ON "DiscussionAreaMember"("areaId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscussionPublication_publishedMessageId_key" ON "DiscussionPublication"("publishedMessageId");

-- CreateIndex
CREATE INDEX "DiscussionPublication_sourceAreaId_idx" ON "DiscussionPublication"("sourceAreaId");

-- CreateIndex
CREATE INDEX "DiscussionPublication_targetAreaId_idx" ON "DiscussionPublication"("targetAreaId");

-- CreateIndex
CREATE INDEX "DiscussionPublication_publishedById_idx" ON "DiscussionPublication"("publishedById");

-- CreateIndex
CREATE INDEX "DiscussionPublication_decisionId_idx" ON "DiscussionPublication"("decisionId");

-- CreateIndex
CREATE INDEX "DiscussionPublication_createdAt_idx" ON "DiscussionPublication"("createdAt");

-- CreateIndex
CREATE INDEX "DiscussionPublicationSource_messageId_idx" ON "DiscussionPublicationSource"("messageId");

-- CreateIndex
CREATE INDEX "CollaborationAuditLog_actorId_idx" ON "CollaborationAuditLog"("actorId");

-- CreateIndex
CREATE INDEX "CollaborationAuditLog_matterId_idx" ON "CollaborationAuditLog"("matterId");

-- CreateIndex
CREATE INDEX "CollaborationAuditLog_areaId_idx" ON "CollaborationAuditLog"("areaId");

-- CreateIndex
CREATE INDEX "CollaborationAuditLog_meetingId_idx" ON "CollaborationAuditLog"("meetingId");

-- CreateIndex
CREATE INDEX "CollaborationAuditLog_action_idx" ON "CollaborationAuditLog"("action");

-- CreateIndex
CREATE INDEX "CollaborationAuditLog_requestId_idx" ON "CollaborationAuditLog"("requestId");

-- CreateIndex
CREATE INDEX "CollaborationAuditLog_createdAt_idx" ON "CollaborationAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "MeetingDecision_decisionId_idx" ON "MeetingDecision"("decisionId");

-- CreateIndex
CREATE INDEX "Decision_matterId_idx" ON "Decision"("matterId");

-- CreateIndex
CREATE INDEX "DiscussionMessage_areaId_createdAt_idx" ON "DiscussionMessage"("areaId", "createdAt");

-- CreateIndex
CREATE INDEX "DiscussionMessage_areaId_id_idx" ON "DiscussionMessage"("areaId", "id");

-- CreateIndex
CREATE INDEX "DiscussionMessage_decisionId_idx" ON "DiscussionMessage"("decisionId");

-- CreateIndex
CREATE INDEX "MeetingSession_areaId_idx" ON "MeetingSession"("areaId");

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_deptId_fkey" FOREIGN KEY ("deptId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatterMember" ADD CONSTRAINT "MatterMember_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatterMember" ADD CONSTRAINT "MatterMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionArea" ADD CONSTRAINT "DiscussionArea_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionArea" ADD CONSTRAINT "DiscussionArea_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionAreaMember" ADD CONSTRAINT "DiscussionAreaMember_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "DiscussionArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionAreaMember" ADD CONSTRAINT "DiscussionAreaMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionMessage" ADD CONSTRAINT "DiscussionMessage_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "DiscussionArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionMessage" ADD CONSTRAINT "DiscussionMessage_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPublication" ADD CONSTRAINT "DiscussionPublication_sourceAreaId_fkey" FOREIGN KEY ("sourceAreaId") REFERENCES "DiscussionArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPublication" ADD CONSTRAINT "DiscussionPublication_targetAreaId_fkey" FOREIGN KEY ("targetAreaId") REFERENCES "DiscussionArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPublication" ADD CONSTRAINT "DiscussionPublication_publishedMessageId_fkey" FOREIGN KEY ("publishedMessageId") REFERENCES "DiscussionMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPublication" ADD CONSTRAINT "DiscussionPublication_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPublication" ADD CONSTRAINT "DiscussionPublication_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPublicationSource" ADD CONSTRAINT "DiscussionPublicationSource_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "DiscussionPublication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPublicationSource" ADD CONSTRAINT "DiscussionPublicationSource_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DiscussionMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaborationAuditLog" ADD CONSTRAINT "CollaborationAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaborationAuditLog" ADD CONSTRAINT "CollaborationAuditLog_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaborationAuditLog" ADD CONSTRAINT "CollaborationAuditLog_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "DiscussionArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaborationAuditLog" ADD CONSTRAINT "CollaborationAuditLog_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "MeetingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSession" ADD CONSTRAINT "MeetingSession_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "DiscussionArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingDecision" ADD CONSTRAINT "MeetingDecision_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "MeetingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingDecision" ADD CONSTRAINT "MeetingDecision_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
