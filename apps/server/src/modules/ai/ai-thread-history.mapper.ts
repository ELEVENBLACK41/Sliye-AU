/**
 * 本文件集中定义 AI Thread 历史查询的 Prisma 白名单选择与浏览器安全映射。
 * 工具 JSON 仅按当前公开契约取值，未知内部字段不会进入历史响应。
 */

import type {
  AiThreadDetail,
  AiThreadListItem,
  AiThreadMessageHistoryItem,
  AiToolCall,
} from '@workspace/contracts/ai';
import type { Prisma } from '../../generated/prisma';
import {
  aiRunPublicSummarySelect,
  toAiMessage,
  toAiRunPublicSummary,
} from './ai-state.mapper';

/** 历史列表与详情共用的安全 Thread 数据库选择。 */
export const aiThreadHistorySelect = {
  id: true,
  title: true,
  activeRunId: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { id: true, title: true } },
  decision: { select: { id: true, title: true } },
  runs: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    select: aiRunPublicSummarySelect,
  },
} as const satisfies Prisma.AiThreadSelect;

/** 消息历史允许公开的工具调用数据库字段。 */
const aiToolCallHistorySelect = {
  id: true,
  runId: true,
  toolCallId: true,
  sequence: true,
  toolName: true,
  status: true,
  input: true,
  resultSummary: true,
  errorCode: true,
  startedAt: true,
  finishedAt: true,
  durationMs: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.AiToolCallSelect;

/** 消息及其全部 Run 重试链的安全数据库选择。 */
export const aiThreadMessageHistorySelect = {
  id: true,
  threadId: true,
  runId: true,
  authorUserId: true,
  role: true,
  content: true,
  createdAt: true,
  answerRuns: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      ...aiRunPublicSummarySelect,
      toolCalls: {
        orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
        select: aiToolCallHistorySelect,
      },
      sourceDependencies: {
        where: { usage: 'ANSWER_CITATION' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { sourceId: true },
      },
    },
  },
} as const satisfies Prisma.AiMessageSelect;

/** 历史列表与详情共用的 Prisma Thread 记录。 */
export type AiThreadHistoryRecord = Prisma.AiThreadGetPayload<{
  select: typeof aiThreadHistorySelect;
}>;

/** 消息历史查询返回的 Prisma 聚合记录。 */
type AiThreadMessageHistoryRecord = Prisma.AiMessageGetPayload<{
  select: typeof aiThreadMessageHistorySelect;
}>;

/** 把数据库 Thread 记录映射为历史列表允许公开的窄摘要。 */
export function toAiThreadListItem(
  record: AiThreadHistoryRecord,
): AiThreadListItem {
  return {
    id: record.id,
    project: record.project,
    decision: record.decision,
    title: record.title,
    activeRunId: record.activeRunId,
    latestRun: record.runs[0] ? toAiRunPublicSummary(record.runs[0]) : null,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** 把数据库 Thread 记录映射为浏览器详情接口的安全快照。 */
export function toAiThreadDetail(
  record: AiThreadHistoryRecord,
): AiThreadDetail {
  return {
    id: record.id,
    project: record.project,
    decision: record.decision,
    title: record.title,
    activeRunId: record.activeRunId,
    latestRun: record.runs[0] ? toAiRunPublicSummary(record.runs[0]) : null,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** 将未知 JSON 值收窄为普通对象，数组与空值不视为结构化摘要。 */
function toJsonRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 从工具结果白名单中提取、去重并保持原顺序的稳定来源 ID。 */
function extractSourceIds(resultSummary: unknown): string[] {
  const record = toJsonRecord(resultSummary);
  const sourceIds = record?.sourceIds;

  if (!Array.isArray(sourceIds)) {
    return [];
  }

  return [
    ...new Set(
      sourceIds.filter(
        (sourceId): sourceId is string =>
          typeof sourceId === 'string' && sourceId.length > 0,
      ),
    ),
  ];
}

/** 把当前唯一工具的输入 JSON 缩减为浏览器允许读取的字段。 */
function toSafeToolInput(input: unknown): AiToolCall['input'] {
  const record = toJsonRecord(input);
  const decisionId = record?.decisionId;

  if (!Number.isInteger(decisionId) || (decisionId as number) <= 0) {
    throw new Error('持久化 AI 工具输入缺少有效 decisionId');
  }

  return { decisionId: decisionId as number };
}

/** 把当前唯一工具的结果 JSON 缩减为浏览器允许读取的受控摘要。 */
function toSafeToolResultSummary(
  resultSummary: unknown,
): AiToolCall['resultSummary'] {
  if (resultSummary === null) {
    return null;
  }

  const record = toJsonRecord(resultSummary);
  if (
    !record ||
    !Number.isInteger(record.decisionId) ||
    typeof record.decisionTitle !== 'string' ||
    typeof record.decisionStatus !== 'string' ||
    typeof record.projectTitle !== 'string' ||
    (record.areaName !== null && typeof record.areaName !== 'string') ||
    !Number.isInteger(record.participantCount) ||
    (record.participantCount as number) < 0
  ) {
    return null;
  }

  return {
    decisionId: record.decisionId as number,
    decisionTitle: record.decisionTitle,
    decisionStatus: record.decisionStatus,
    projectTitle: record.projectTitle,
    areaName: record.areaName,
    participantCount: record.participantCount as number,
    sourceIds: extractSourceIds(record),
  };
}

/** 把持久化工具调用映射为只包含白名单输入与结果的公开快照。 */
function toSafeAiToolCall(
  record: AiThreadMessageHistoryRecord['answerRuns'][number]['toolCalls'][number],
): AiToolCall {
  if (record.toolName !== 'getDecisionContext') {
    throw new Error(`不支持恢复未知 AI 工具 ${record.toolName}`);
  }

  return {
    id: record.id,
    runId: record.runId,
    toolCallId: record.toolCallId,
    sequence: record.sequence,
    toolName: record.toolName,
    status: record.status,
    input: toSafeToolInput(record.input),
    resultSummary: toSafeToolResultSummary(record.resultSummary),
    errorCode: record.errorCode,
    startedAt: record.startedAt?.toISOString() ?? null,
    finishedAt: record.finishedAt?.toISOString() ?? null,
    durationMs: record.durationMs,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** 把一条消息及其 Run 重试链映射为稳定的历史恢复部件。 */
export function toAiThreadMessageHistoryItem(
  record: AiThreadMessageHistoryRecord,
): AiThreadMessageHistoryItem {
  return {
    message: toAiMessage(record),
    runs: record.answerRuns.map((runRecord) => {
      const toolCalls = runRecord.toolCalls.map(toSafeAiToolCall);

      return {
        run: toAiRunPublicSummary(runRecord),
        toolCalls,
        sourceIds: [
          ...new Set([
            ...runRecord.sourceDependencies.map(
              (dependency) => dependency.sourceId,
            ),
            ...toolCalls.flatMap(
              (toolCall) => toolCall.resultSummary?.sourceIds ?? [],
            ),
          ]),
        ],
      };
    }),
  };
}
