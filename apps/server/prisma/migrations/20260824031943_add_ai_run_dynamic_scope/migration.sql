-- CreateEnum
CREATE TYPE "AiRunScopeResolutionStatus" AS ENUM ('UNRESOLVED', 'AWAITING_CONFIRMATION', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AiRunScopeResolutionMethod" AS ENUM ('EXACT_REFERENCE', 'USER_CONFIRMED');

-- AlterTable
ALTER TABLE "AiRun" ADD COLUMN     "scopeResolutionMethod" "AiRunScopeResolutionMethod",
ADD COLUMN     "scopeResolvedAt" TIMESTAMP(3),
ADD COLUMN     "scopeStatus" "AiRunScopeResolutionStatus" NOT NULL DEFAULT 'UNRESOLVED';

-- AlterTable
ALTER TABLE "AiThread" ALTER COLUMN "projectId" DROP NOT NULL,
ALTER COLUMN "decisionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AiRunDecisionScope" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "decisionId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "areaId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRunDecisionScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRunDecisionCandidate" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "decisionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRunDecisionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRunDecisionScope_decisionId_idx" ON "AiRunDecisionScope"("decisionId");

-- CreateIndex
CREATE INDEX "AiRunDecisionScope_projectId_idx" ON "AiRunDecisionScope"("projectId");

-- CreateIndex
CREATE INDEX "AiRunDecisionScope_areaId_idx" ON "AiRunDecisionScope"("areaId");

-- CreateIndex
CREATE UNIQUE INDEX "AiRunDecisionScope_runId_decisionId_key" ON "AiRunDecisionScope"("runId", "decisionId");

-- CreateIndex
CREATE INDEX "AiRunDecisionCandidate_decisionId_idx" ON "AiRunDecisionCandidate"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "AiRunDecisionCandidate_runId_decisionId_key" ON "AiRunDecisionCandidate"("runId", "decisionId");

-- CreateIndex
CREATE INDEX "AiRun_scopeStatus_createdAt_idx" ON "AiRun"("scopeStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "AiRunDecisionScope" ADD CONSTRAINT "AiRunDecisionScope_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRunDecisionScope" ADD CONSTRAINT "AiRunDecisionScope_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRunDecisionScope" ADD CONSTRAINT "AiRunDecisionScope_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRunDecisionScope" ADD CONSTRAINT "AiRunDecisionScope_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "DiscussionArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRunDecisionCandidate" ADD CONSTRAINT "AiRunDecisionCandidate_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRunDecisionCandidate" ADD CONSTRAINT "AiRunDecisionCandidate_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BackfillData
-- 2.6 的每个 Run 继承所属 Thread 的单项决策，迁移后继续保持原有可读与可执行语义。
INSERT INTO "AiRunDecisionScope" ("id", "runId", "decisionId", "projectId", "areaId")
SELECT gen_random_uuid(), run."id", thread."decisionId", decision."projectId", decision."areaId"
FROM "AiRun" AS run
INNER JOIN "AiThread" AS thread ON thread."id" = run."threadId"
INNER JOIN "Decision" AS decision ON decision."id" = thread."decisionId"
WHERE thread."decisionId" IS NOT NULL;

UPDATE "AiRun" AS run
SET
  "scopeStatus" = 'RESOLVED',
  "scopeResolutionMethod" = 'EXACT_REFERENCE',
  "scopeResolvedAt" = run."createdAt"
FROM "AiThread" AS thread
WHERE thread."id" = run."threadId"
  AND thread."decisionId" IS NOT NULL;
