-- AlterEnum
BEGIN;
CREATE TYPE "DiscussionMessageType_new" AS ENUM ('TEXT', 'SYSTEM');
ALTER TABLE "public"."DiscussionMessage" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "DiscussionMessage" ALTER COLUMN "type" TYPE "DiscussionMessageType_new" USING ("type"::text::"DiscussionMessageType_new");
ALTER TYPE "DiscussionMessageType" RENAME TO "DiscussionMessageType_old";
ALTER TYPE "DiscussionMessageType_new" RENAME TO "DiscussionMessageType";
DROP TYPE "public"."DiscussionMessageType_old";
ALTER TABLE "DiscussionMessage" ALTER COLUMN "type" SET DEFAULT 'TEXT';
COMMIT;

-- DropForeignKey
ALTER TABLE "DiscussionPublication" DROP CONSTRAINT "DiscussionPublication_decisionId_fkey";

-- DropForeignKey
ALTER TABLE "DiscussionPublication" DROP CONSTRAINT "DiscussionPublication_publishedById_fkey";

-- DropForeignKey
ALTER TABLE "DiscussionPublication" DROP CONSTRAINT "DiscussionPublication_publishedMessageId_fkey";

-- DropForeignKey
ALTER TABLE "DiscussionPublication" DROP CONSTRAINT "DiscussionPublication_sourceAreaId_fkey";

-- DropForeignKey
ALTER TABLE "DiscussionPublication" DROP CONSTRAINT "DiscussionPublication_targetAreaId_fkey";

-- DropForeignKey
ALTER TABLE "DiscussionPublicationSource" DROP CONSTRAINT "DiscussionPublicationSource_messageId_fkey";

-- DropForeignKey
ALTER TABLE "DiscussionPublicationSource" DROP CONSTRAINT "DiscussionPublicationSource_publicationId_fkey";

-- DropTable
DROP TABLE "DiscussionPublication";

-- DropTable
DROP TABLE "DiscussionPublicationSource";
