-- AlterTable
ALTER TABLE "Decision" ADD COLUMN     "areaId" INTEGER;

-- CreateIndex
CREATE INDEX "Decision_areaId_idx" ON "Decision"("areaId");

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "DiscussionArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
