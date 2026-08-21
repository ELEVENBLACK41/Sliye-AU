-- CreateEnum
CREATE TYPE "AiToolCallStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "AiToolCall" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "toolCallId" VARCHAR(160) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "toolName" VARCHAR(80) NOT NULL,
    "status" "AiToolCallStatus" NOT NULL DEFAULT 'RUNNING',
    "input" JSONB NOT NULL,
    "resultSummary" JSONB,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiToolCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiToolCall_toolName_status_idx" ON "AiToolCall"("toolName", "status");

-- CreateIndex
CREATE INDEX "AiToolCall_createdAt_idx" ON "AiToolCall"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiToolCall_runId_toolCallId_key" ON "AiToolCall"("runId", "toolCallId");

-- CreateIndex
CREATE UNIQUE INDEX "AiToolCall_runId_sequence_key" ON "AiToolCall"("runId", "sequence");

-- AddForeignKey
ALTER TABLE "AiToolCall" ADD CONSTRAINT "AiToolCall_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
