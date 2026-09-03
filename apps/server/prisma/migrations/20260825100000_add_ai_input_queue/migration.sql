-- CreateEnum
CREATE TYPE "AiMessageDispatchState" AS ENUM ('QUEUED', 'DISPATCHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AiMessageSubmissionMode" AS ENUM ('NORMAL', 'STEER');

-- AlterTable
ALTER TABLE "AiMessage" ADD COLUMN     "dispatchState" "AiMessageDispatchState",
ADD COLUMN     "queueSequence" INTEGER,
ADD COLUMN     "requestedModelRole" "AiLanguageModelRole",
ADD COLUMN     "submissionMode" "AiMessageSubmissionMode";

-- AlterTable
ALTER TABLE "AiThread" ADD COLUMN     "nextQueueSequence" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "AiMessage_threadId_dispatchState_queueSequence_idx" ON "AiMessage"("threadId", "dispatchState", "queueSequence");

-- CreateIndex
CREATE UNIQUE INDEX "AiMessage_threadId_queueSequence_key" ON "AiMessage"("threadId", "queueSequence");
