-- AlterEnum
-- 本 migration 只增加当前核心决策过程工具实际需要的来源类型。
ALTER TYPE "AiSourceType" ADD VALUE 'DECISION_PROPOSAL';
ALTER TYPE "AiSourceType" ADD VALUE 'DECISION_VOTE_ROUND';
