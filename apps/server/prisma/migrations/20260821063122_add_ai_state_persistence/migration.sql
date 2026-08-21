-- CreateEnum
CREATE TYPE "AiThreadScopeState" AS ENUM ('ACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "AiThreadLockReason" AS ENUM ('SCOPE_CHANGED');

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'CANCELLATION_REQUESTED', 'CANCELLED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiLanguageModelRole" AS ENUM ('STANDARD', 'DEEP_REVIEW');

-- CreateEnum
CREATE TYPE "AiRunCancellationReason" AS ENUM ('USER_REQUESTED', 'SCOPE_CHANGED');

-- CreateEnum
CREATE TYPE "AiRunFailureReason" AS ENUM ('MODEL_ERROR', 'TOOL_ERROR', 'EXECUTION_LEASE_EXPIRED', 'INTERNAL_ERROR');

-- CreateEnum
CREATE TYPE "AiEventType" AS ENUM ('RUN_STATUS_CHANGED', 'ASSISTANT_TEXT_DELTA');

-- CreateEnum
CREATE TYPE "AiRequestOperation" AS ENUM ('CREATE_THREAD', 'SEND_MESSAGE', 'RETRY_RUN');

-- CreateTable
CREATE TABLE "AiThread" (
    "id" UUID NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "decisionId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "activeRunId" UUID,
    "scopeState" "AiThreadScopeState" NOT NULL DEFAULT 'ACTIVE',
    "lockReason" "AiThreadLockReason",
    "scopeChangedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "runId" UUID,
    "authorUserId" INTEGER,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRun" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "userMessageId" UUID NOT NULL,
    "retryOfRunId" UUID,
    "status" "AiRunStatus" NOT NULL DEFAULT 'QUEUED',
    "modelRole" "AiLanguageModelRole" NOT NULL,
    "resolvedModelId" TEXT,
    "executionLeaseId" UUID,
    "executionLeaseExpiresAt" TIMESTAMP(3),
    "cancellationReason" "AiRunCancellationReason",
    "failureReason" "AiRunFailureReason",
    "failureCode" TEXT,
    "modelCallCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "nextEventSequence" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiStep" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "modelRole" "AiLanguageModelRole" NOT NULL,
    "resolvedModelId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "responseId" TEXT,
    "finishReason" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "estimatedCostUsd" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "timeToFirstOutputMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEvent" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "AiEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRequestDeduplication" (
    "id" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "operation" "AiRequestOperation" NOT NULL,
    "scopeKey" VARCHAR(96) NOT NULL,
    "clientRequestId" UUID NOT NULL,
    "requestFingerprint" CHAR(64) NOT NULL,
    "threadId" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRequestDeduplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiThread_activeRunId_key" ON "AiThread"("activeRunId");

-- CreateIndex
CREATE INDEX "AiThread_ownerUserId_archivedAt_updatedAt_idx" ON "AiThread"("ownerUserId", "archivedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "AiThread_projectId_idx" ON "AiThread"("projectId");

-- CreateIndex
CREATE INDEX "AiThread_decisionId_updatedAt_idx" ON "AiThread"("decisionId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiThread_scopeState_idx" ON "AiThread"("scopeState");

-- CreateIndex
CREATE UNIQUE INDEX "AiMessage_runId_key" ON "AiMessage"("runId");

-- CreateIndex
CREATE INDEX "AiMessage_threadId_createdAt_idx" ON "AiMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "AiMessage_authorUserId_idx" ON "AiMessage"("authorUserId");

-- CreateIndex
CREATE INDEX "AiRun_threadId_createdAt_idx" ON "AiRun"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRun_threadId_status_idx" ON "AiRun"("threadId", "status");

-- CreateIndex
CREATE INDEX "AiRun_retryOfRunId_idx" ON "AiRun"("retryOfRunId");

-- CreateIndex
CREATE INDEX "AiRun_status_executionLeaseExpiresAt_idx" ON "AiRun"("status", "executionLeaseExpiresAt");

-- CreateIndex
CREATE INDEX "AiStep_resolvedModelId_idx" ON "AiStep"("resolvedModelId");

-- CreateIndex
CREATE INDEX "AiStep_createdAt_idx" ON "AiStep"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiStep_runId_sequence_key" ON "AiStep"("runId", "sequence");

-- CreateIndex
CREATE INDEX "AiEvent_runId_createdAt_idx" ON "AiEvent"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "AiEvent_type_idx" ON "AiEvent"("type");

-- CreateIndex
CREATE UNIQUE INDEX "AiEvent_runId_sequence_key" ON "AiEvent"("runId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "AiRequestDeduplication_runId_key" ON "AiRequestDeduplication"("runId");

-- CreateIndex
CREATE INDEX "AiRequestDeduplication_expiresAt_idx" ON "AiRequestDeduplication"("expiresAt");

-- CreateIndex
CREATE INDEX "AiRequestDeduplication_threadId_idx" ON "AiRequestDeduplication"("threadId");

-- CreateIndex
CREATE INDEX "AiRequestDeduplication_messageId_idx" ON "AiRequestDeduplication"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "AiRequestDeduplication_userId_operation_scopeKey_clientRequ_key" ON "AiRequestDeduplication"("userId", "operation", "scopeKey", "clientRequestId");

-- AddForeignKey
ALTER TABLE "AiThread" ADD CONSTRAINT "AiThread_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiThread" ADD CONSTRAINT "AiThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiThread" ADD CONSTRAINT "AiThread_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiThread" ADD CONSTRAINT "AiThread_activeRunId_fkey" FOREIGN KEY ("activeRunId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AiThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AiThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_userMessageId_fkey" FOREIGN KEY ("userMessageId") REFERENCES "AiMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_retryOfRunId_fkey" FOREIGN KEY ("retryOfRunId") REFERENCES "AiRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiStep" ADD CONSTRAINT "AiStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvent" ADD CONSTRAINT "AiEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRequestDeduplication" ADD CONSTRAINT "AiRequestDeduplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRequestDeduplication" ADD CONSTRAINT "AiRequestDeduplication_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AiThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRequestDeduplication" ADD CONSTRAINT "AiRequestDeduplication_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AiMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRequestDeduplication" ADD CONSTRAINT "AiRequestDeduplication_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
