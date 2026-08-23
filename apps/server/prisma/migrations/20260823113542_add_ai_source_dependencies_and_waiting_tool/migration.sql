-- CreateEnum
CREATE TYPE "AiSourceDependencyUsage" AS ENUM ('TOOL_READ', 'ANSWER_CITATION');

-- AlterEnum
ALTER TYPE "AiToolCallStatus" ADD VALUE 'WAITING';

-- AlterTable
ALTER TABLE "AiToolCall" ALTER COLUMN "startedAt" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AiSourceDependency" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "sourceId" VARCHAR(160) NOT NULL,
    "usage" "AiSourceDependencyUsage" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSourceDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiSourceDependency_runId_idx" ON "AiSourceDependency"("runId");

-- CreateIndex
CREATE INDEX "AiSourceDependency_sourceId_idx" ON "AiSourceDependency"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "AiSourceDependency_runId_sourceId_usage_key" ON "AiSourceDependency"("runId", "sourceId", "usage");

-- AddForeignKey
ALTER TABLE "AiSourceDependency" ADD CONSTRAINT "AiSourceDependency_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
