/**
 * 本文件把 Prisma AI 状态记录映射为不依赖数据库实现的共享契约。
 */

import type {
  AiLanguageModelRole,
  AiMessage,
  AiRun,
  AiThread,
} from '@workspace/contracts/ai';
import type { ApiErrorCode } from '@workspace/contracts/common';
import type {
  AiMessage as PrismaAiMessage,
  AiRun as PrismaAiRun,
  AiStep as PrismaAiStep,
  AiThread as PrismaAiThread,
  AiLanguageModelRole as PrismaAiLanguageModelRole,
} from '../../generated/prisma';
import type { AiModelStepRecord } from './types/ai-state-persistence.types';

/** 把共享模型角色映射为数据库枚举。 */
export function toPrismaAiLanguageModelRole(
  role: AiLanguageModelRole,
): PrismaAiLanguageModelRole {
  return role === 'deepReview' ? 'DEEP_REVIEW' : 'STANDARD';
}

/** 把数据库模型角色映射回共享契约。 */
export function toAiLanguageModelRole(
  role: PrismaAiLanguageModelRole,
): AiLanguageModelRole {
  return role === 'DEEP_REVIEW' ? 'deepReview' : 'standard';
}

/** 把 Prisma Thread 记录映射为共享 Thread。 */
export function toAiThread(record: PrismaAiThread): AiThread {
  return {
    id: record.id,
    ownerUserId: record.ownerUserId,
    projectId: record.projectId,
    decisionId: record.decisionId,
    title: record.title,
    activeRunId: record.activeRunId,
    scopeState: record.scopeState,
    lockReason: record.lockReason,
    scopeChangedAt: record.scopeChangedAt?.toISOString() ?? null,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** 把 Prisma Message 记录映射为共享 Message。 */
export function toAiMessage(record: PrismaAiMessage): AiMessage {
  return {
    id: record.id,
    threadId: record.threadId,
    runId: record.runId,
    authorUserId: record.authorUserId,
    role: record.role,
    content: record.content,
    createdAt: record.createdAt.toISOString(),
  };
}

/** 把 Prisma Run 记录映射为共享 Run，并按模型调用数量决定是否暴露用量。 */
export function toAiRun(record: PrismaAiRun): AiRun {
  return {
    id: record.id,
    threadId: record.threadId,
    userMessageId: record.userMessageId,
    retryOfRunId: record.retryOfRunId,
    status: record.status,
    modelRole: toAiLanguageModelRole(record.modelRole),
    resolvedModelId: record.resolvedModelId,
    executionLeaseId: record.executionLeaseId,
    executionLeaseExpiresAt:
      record.executionLeaseExpiresAt?.toISOString() ?? null,
    cancellationReason: record.cancellationReason,
    failureReason: record.failureReason,
    failureCode: record.failureCode as ApiErrorCode | null,
    usage:
      record.modelCallCount === 0
        ? null
        : {
            inputTokens: record.inputTokens,
            outputTokens: record.outputTokens,
            totalTokens: record.totalTokens,
            estimatedCostUsd: record.estimatedCostUsd.toNumber(),
          },
    startedAt: record.startedAt?.toISOString() ?? null,
    finishedAt: record.finishedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** 把 Prisma Step 记录映射为后端运行时可消费的模型调用快照。 */
export function toAiModelStepRecord(record: PrismaAiStep): AiModelStepRecord {
  return {
    id: record.id,
    runId: record.runId,
    sequence: record.sequence,
    modelRole: toAiLanguageModelRole(record.modelRole),
    resolvedModelId: record.resolvedModelId,
    provider: record.provider,
    responseId: record.responseId,
    finishReason: record.finishReason,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    totalTokens: record.totalTokens,
    estimatedCostUsd: record.estimatedCostUsd.toNumber(),
    startedAt: record.startedAt.toISOString(),
    finishedAt: record.finishedAt.toISOString(),
    durationMs: record.durationMs,
    timeToFirstOutputMs: record.timeToFirstOutputMs,
    createdAt: record.createdAt.toISOString(),
  };
}
