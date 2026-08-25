-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'CANCELLATION_REQUESTED', 'CANCELLED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiEventType" AS ENUM ('RUN_STATUS_CHANGED', 'ASSISTANT_TEXT_DELTA');

-- CreateEnum
CREATE TYPE "AiLanguageModelRole" AS ENUM ('STANDARD', 'DEEP_REVIEW');

-- CreateTable
CREATE TABLE "AiThread" (
    "id" TEXT NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "createIdempotencyKey" TEXT NOT NULL,
    "createRequestFingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "activeRunId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorUserId" INTEGER,
    "clientRequestId" TEXT,
    "requestFingerprint" TEXT,
    "runId" TEXT,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userMessageId" TEXT NOT NULL,
    "retryOfRunId" TEXT,
    "retryIdempotencyKey" TEXT,
    "retryRequestFingerprint" TEXT,
    "status" "AiRunStatus" NOT NULL DEFAULT 'QUEUED',
    "modelRole" "AiLanguageModelRole" NOT NULL DEFAULT 'STANDARD',
    "resolvedModelId" TEXT,
    "executionLeaseId" TEXT,
    "executionLeaseExpiresAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "failureReason" TEXT,
    "failureCode" TEXT,
    "usage" JSONB,
    "nextEventSequence" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "AiEventType" NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiThread_activeRunId_key" ON "AiThread"("activeRunId");

-- CreateIndex
CREATE INDEX "AiThread_ownerUserId_archivedAt_updatedAt_idx" ON "AiThread"("ownerUserId", "archivedAt", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiThread_ownerUserId_createIdempotencyKey_key" ON "AiThread"("ownerUserId", "createIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AiMessage_runId_key" ON "AiMessage"("runId");

-- CreateIndex
CREATE INDEX "AiMessage_threadId_createdAt_id_idx" ON "AiMessage"("threadId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AiMessage_threadId_authorUserId_clientRequestId_key" ON "AiMessage"("threadId", "authorUserId", "clientRequestId");

-- CreateIndex
CREATE INDEX "AiRun_threadId_status_idx" ON "AiRun"("threadId", "status");

-- CreateIndex
CREATE INDEX "AiRun_userMessageId_idx" ON "AiRun"("userMessageId");

-- CreateIndex
CREATE INDEX "AiRun_retryOfRunId_idx" ON "AiRun"("retryOfRunId");

-- CreateIndex
CREATE UNIQUE INDEX "AiRun_retryOfRunId_retryIdempotencyKey_key" ON "AiRun"("retryOfRunId", "retryIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AiRun_one_non_terminal_per_thread_key" ON "AiRun"("threadId") WHERE "status" IN ('QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'CANCELLATION_REQUESTED');

-- CreateIndex
CREATE UNIQUE INDEX "AiEvent_runId_sequence_key" ON "AiEvent"("runId", "sequence");

-- AddForeignKey
ALTER TABLE "AiThread" ADD CONSTRAINT "AiThread_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiThread" ADD CONSTRAINT "AiThread_activeRunId_fkey" FOREIGN KEY ("activeRunId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AiThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AiThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_userMessageId_fkey" FOREIGN KEY ("userMessageId") REFERENCES "AiMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_retryOfRunId_fkey" FOREIGN KEY ("retryOfRunId") REFERENCES "AiRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvent" ADD CONSTRAINT "AiEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddConstraint
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_role_origin_check" CHECK (("role" = 'USER' AND "authorUserId" IS NOT NULL AND "runId" IS NULL AND "clientRequestId" IS NOT NULL AND "requestFingerprint" IS NOT NULL) OR ("role" = 'ASSISTANT' AND "authorUserId" IS NULL AND "runId" IS NOT NULL AND "clientRequestId" IS NULL AND "requestFingerprint" IS NULL));

-- AddConstraint
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_retry_request_pair_check" CHECK (("retryOfRunId" IS NULL AND "retryIdempotencyKey" IS NULL AND "retryRequestFingerprint" IS NULL) OR ("retryOfRunId" IS NOT NULL AND "retryIdempotencyKey" IS NOT NULL AND "retryRequestFingerprint" IS NOT NULL));

-- AddConstraint
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_nextEventSequence_positive_check" CHECK ("nextEventSequence" > 0);

-- AddConstraint
ALTER TABLE "AiEvent" ADD CONSTRAINT "AiEvent_sequence_positive_check" CHECK ("sequence" > 0);
