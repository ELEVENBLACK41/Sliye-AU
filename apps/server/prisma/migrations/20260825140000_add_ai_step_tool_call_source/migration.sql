-- AlterEnum
ALTER TYPE "AiEventType" ADD VALUE 'TOOL_CALL_STARTED';
ALTER TYPE "AiEventType" ADD VALUE 'TOOL_CALL_SETTLED';

-- CreateEnum
CREATE TYPE "AiToolCallStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiSourceType" AS ENUM ('DECISION', 'DECISION_RESOLUTION');

-- CreateEnum
CREATE TYPE "AiSourceUsage" AS ENUM ('READ', 'CITED');

-- CreateTable
CREATE TABLE "AiStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "resolvedModelId" TEXT,
    "finishReason" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiToolCall" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT,
    "providerToolCallId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "status" "AiToolCallStatus" NOT NULL DEFAULT 'RUNNING',
    "input" JSONB NOT NULL,
    "outputSummary" JSONB,
    "failureCode" TEXT,
    "failureReason" TEXT,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiToolCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSourceDependency" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "toolCallId" TEXT,
    "sourceType" "AiSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "usage" "AiSourceUsage" NOT NULL DEFAULT 'READ',
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSourceDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiStep_runId_sequence_key" ON "AiStep"("runId", "sequence");

-- CreateIndex
CREATE INDEX "AiToolCall_runId_createdAt_idx" ON "AiToolCall"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "AiToolCall_toolName_idx" ON "AiToolCall"("toolName");

-- CreateIndex
CREATE UNIQUE INDEX "AiToolCall_runId_providerToolCallId_key" ON "AiToolCall"("runId", "providerToolCallId");

-- CreateIndex
CREATE INDEX "AiSourceDependency_sourceType_sourceId_idx" ON "AiSourceDependency"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "AiSourceDependency_runId_sourceType_sourceId_usage_key" ON "AiSourceDependency"("runId", "sourceType", "sourceId", "usage");

-- AddForeignKey
ALTER TABLE "AiStep" ADD CONSTRAINT "AiStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiToolCall" ADD CONSTRAINT "AiToolCall_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiToolCall" ADD CONSTRAINT "AiToolCall_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "AiStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSourceDependency" ADD CONSTRAINT "AiSourceDependency_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSourceDependency" ADD CONSTRAINT "AiSourceDependency_toolCallId_fkey" FOREIGN KEY ("toolCallId") REFERENCES "AiToolCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddConstraint
ALTER TABLE "AiStep" ADD CONSTRAINT "AiStep_sequence_positive_check" CHECK ("sequence" > 0);

-- AddConstraint
ALTER TABLE "AiToolCall" ADD CONSTRAINT "AiToolCall_settled_outcome_check" CHECK (("status" = 'RUNNING' AND "finishedAt" IS NULL AND "failureCode" IS NULL AND "failureReason" IS NULL) OR ("status" = 'SUCCEEDED' AND "finishedAt" IS NOT NULL AND "failureCode" IS NULL AND "failureReason" IS NULL) OR ("status" = 'FAILED' AND "finishedAt" IS NOT NULL AND "failureCode" IS NOT NULL AND "failureReason" IS NOT NULL));
