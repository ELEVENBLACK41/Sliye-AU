-- AlterTable
ALTER TABLE "AiThread" ADD COLUMN     "pinnedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AiThread_ownerUserId_pinnedAt_idx" ON "AiThread"("ownerUserId", "pinnedAt");
