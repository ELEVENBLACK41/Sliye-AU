-- AlterTable
ALTER TABLE "DiscussionMessage" ADD COLUMN     "clientMessageId" UUID;

-- CreateIndex
CREATE INDEX "DiscussionMessage_spaceId_id_idx" ON "DiscussionMessage"("spaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DiscussionMessage_authorId_clientMessageId_key" ON "DiscussionMessage"("authorId", "clientMessageId");
