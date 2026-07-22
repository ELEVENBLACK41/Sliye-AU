-- DropForeignKey
ALTER TABLE "DiscussionSpaceMember" DROP CONSTRAINT "DiscussionSpaceMember_spaceId_fkey";

-- DropForeignKey
ALTER TABLE "DiscussionSpaceMember" DROP CONSTRAINT "DiscussionSpaceMember_userId_fkey";

-- DropForeignKey
ALTER TABLE "DiscussionMessage" DROP CONSTRAINT "DiscussionMessage_spaceId_fkey";

-- DropForeignKey
ALTER TABLE "DiscussionMessage" DROP CONSTRAINT "DiscussionMessage_decisionId_fkey";

-- DropForeignKey
ALTER TABLE "Decision" DROP CONSTRAINT "Decision_spaceId_fkey";

-- DropForeignKey
ALTER TABLE "MeetingDecision" DROP CONSTRAINT "MeetingDecision_meetingId_fkey";

-- DropForeignKey
ALTER TABLE "MeetingDecision" DROP CONSTRAINT "MeetingDecision_decisionId_fkey";

-- DropIndex
DROP INDEX "DiscussionMessage_decisionId_idx";

-- DropIndex
DROP INDEX "Decision_spaceId_idx";

-- AlterTable
ALTER TABLE "DiscussionSpace" ADD COLUMN "closedAt" TIMESTAMP(3);

-- 已有决策尚未创建协作群组时逐项补建；如果历史数据误用了共享群组，也为后续决策拆出独立群组。
DO $$
DECLARE
  decision_record RECORD;
  new_space_id INTEGER;
BEGIN
  FOR decision_record IN
    SELECT
      decision_item."id",
      decision_item."title",
      decision_item."description",
      decision_item."status",
      decision_item."creatorId",
      decision_item."decidedAt",
      decision_item."archivedAt",
      decision_item."createdAt",
      decision_item."updatedAt"
    FROM "Decision" AS decision_item
    WHERE decision_item."spaceId" IS NULL
      OR EXISTS (
        SELECT 1
        FROM "Decision" AS earlier_decision
        WHERE earlier_decision."spaceId" = decision_item."spaceId"
          AND earlier_decision."id" < decision_item."id"
      )
    ORDER BY decision_item."id"
  LOOP
    INSERT INTO "DiscussionSpace" (
      "name",
      "description",
      "status",
      "createdById",
      "closedAt",
      "archivedAt",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      decision_record."title",
      decision_record."description",
      CASE
        WHEN decision_record."status"::text = 'ARCHIVED' THEN 'ARCHIVED'::"DiscussionSpaceStatus"
        WHEN decision_record."status"::text IN ('RESOLVED', 'CANCELLED') THEN 'READ_ONLY'::"DiscussionSpaceStatus"
        ELSE 'ACTIVE'::"DiscussionSpaceStatus"
      END,
      decision_record."creatorId",
      CASE
        WHEN decision_record."status"::text IN ('RESOLVED', 'CANCELLED', 'ARCHIVED')
          THEN COALESCE(decision_record."decidedAt", decision_record."archivedAt", decision_record."updatedAt")
        ELSE NULL
      END,
      decision_record."archivedAt",
      decision_record."createdAt",
      decision_record."updatedAt"
    )
    RETURNING "id" INTO new_space_id;

    UPDATE "Decision"
    SET "spaceId" = new_space_id
    WHERE "id" = decision_record."id";
  END LOOP;
END $$;

-- 将已经有关联空间的历史决策同步为相同的关闭状态。
UPDATE "DiscussionSpace" AS discussion_space
SET
  "status" = CASE
    WHEN decision_item."status"::text = 'ARCHIVED' THEN 'ARCHIVED'::"DiscussionSpaceStatus"
    WHEN decision_item."status"::text IN ('RESOLVED', 'CANCELLED') THEN 'READ_ONLY'::"DiscussionSpaceStatus"
    ELSE 'ACTIVE'::"DiscussionSpaceStatus"
  END,
  "closedAt" = CASE
    WHEN decision_item."status"::text IN ('RESOLVED', 'CANCELLED', 'ARCHIVED')
      THEN COALESCE(decision_item."decidedAt", decision_item."archivedAt", decision_item."updatedAt")
    ELSE NULL
  END,
  "archivedAt" = decision_item."archivedAt"
FROM "Decision" AS decision_item
WHERE decision_item."spaceId" = discussion_space."id";

-- 历史群成员折叠进决策参与者，避免移除重复成员表时丢失已有成员。
INSERT INTO "DecisionParticipant" (
  "decisionId",
  "userId",
  "role",
  "createdAt",
  "updatedAt"
)
SELECT
  decision_item."id",
  space_member."userId",
  CASE
    WHEN space_member."role"::text = 'OWNER' THEN 'OWNER'::"ParticipantRole"
    WHEN space_member."role"::text = 'ADMIN' THEN 'EDITOR'::"ParticipantRole"
    ELSE 'VIEWER'::"ParticipantRole"
  END,
  space_member."createdAt",
  space_member."updatedAt"
FROM "DiscussionSpaceMember" AS space_member
INNER JOIN "Decision" AS decision_item ON decision_item."spaceId" = space_member."spaceId"
ON CONFLICT ("decisionId", "userId") DO NOTHING;

-- AlterTable
ALTER TABLE "DiscussionMessage" DROP COLUMN "decisionId";

-- AlterTable
ALTER TABLE "Decision" ALTER COLUMN "spaceId" SET NOT NULL;

-- DropTable
DROP TABLE "DiscussionSpaceMember";

-- DropTable
DROP TABLE "MeetingDecision";

-- DropEnum
DROP TYPE "DiscussionSpaceMemberRole";

-- CreateIndex
CREATE UNIQUE INDEX "Decision_spaceId_key" ON "Decision"("spaceId");

-- AddForeignKey
ALTER TABLE "DiscussionMessage" ADD CONSTRAINT "DiscussionMessage_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "DiscussionSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "DiscussionSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
