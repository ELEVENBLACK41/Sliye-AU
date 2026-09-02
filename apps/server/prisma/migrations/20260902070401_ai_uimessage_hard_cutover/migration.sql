-- C4-B1 硬切换：只清理旧 AI 数据，保留项目、决策、会议、用户和权限数据。
-- 删除顺序遵循现有外键与 AiMessage/AiRun 的 CHECK 约束，避免把助手消息置为 NULL。
DELETE FROM "AiEvent";
DELETE FROM "AiSourceDependency";
DELETE FROM "AiToolCall";
DELETE FROM "AiStep";
DELETE FROM "AiMessage" WHERE "role" = 'ASSISTANT';
DELETE FROM "AiRun";
DELETE FROM "AiMessage";
DELETE FROM "AiThread";

-- AlterTable
ALTER TABLE "AiMessage" ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "parts" JSONB NOT NULL DEFAULT '[]';
