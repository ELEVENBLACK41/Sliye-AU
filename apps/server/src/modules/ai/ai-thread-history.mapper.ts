/**
 * 本文件集中定义 AI Thread 历史查询的 Prisma 白名单选择与浏览器安全映射。
 * 工具 JSON 仅按当前公开契约取值，未知内部字段不会进入历史响应。
 */

import type {
  AiHistoryContentVisibility,
  AiHistoryMessage,
  AiHistoryToolCall,
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

/** 历史安全映射消费的服务端来源判定。 */
type AiHistorySourceVisibilityMap = ReadonlyMap<
  string,
  Extract<AiHistoryContentVisibility, { state: 'HIDDEN' }>['reason'] | null
>;

/** 不携带隐藏原因的稳定可见状态。 */
const VISIBLE_HISTORY_CONTENT = {
  state: 'VISIBLE',
  reason: null,
} as const satisfies AiHistoryContentVisibility;

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
  generatedByRun: {
    select: {
      toolCalls: {
        where: { status: 'COMPLETED' },
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
export type AiThreadMessageHistoryRecord = Prisma.AiMessageGetPayload<{
  select: typeof aiThreadMessageHistorySelect;
}>;

/** 把数据库 Thread 记录映射为历史列表允许公开的窄摘要。 */
export function toAiThreadListItem(
  record: AiThreadHistoryRecord,
  exposeLegacyScope = true,
): AiThreadListItem {
  return {
    id: record.id,
    project: exposeLegacyScope ? record.project : null,
    decision: exposeLegacyScope ? record.decision : null,
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
  exposeLegacyScope = true,
): AiThreadDetail {
  return {
    id: record.id,
    project: exposeLegacyScope ? record.project : null,
    decision: exposeLegacyScope ? record.decision : null,
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

/** 从工具输入和结果摘要中提取本次工具部件实际依赖的全部来源。 */
function extractToolDependencySourceIds(
  record: AiThreadMessageHistoryRecord['answerRuns'][number]['toolCalls'][number],
): string[] {
  const input = toJsonRecord(record.input);
  const decisionId = input?.decisionId;
  if (!Number.isInteger(decisionId) || (decisionId as number) <= 0) {
    return ['__invalid_tool_input__'];
  }

  const sourceIds = new Set<string>([`decision:${decisionId as number}`]);
  if (record.resultSummary === null) {
    return [...sourceIds];
  }

  const summary = toJsonRecord(record.resultSummary);
  if (!summary || !Array.isArray(summary.sourceIds)) {
    return ['__invalid_tool_sources__'];
  }
  for (const sourceId of summary.sourceIds) {
    if (typeof sourceId !== 'string' || sourceId.length === 0) {
      return ['__invalid_tool_sources__'];
    }
    sourceIds.add(sourceId);
  }

  return [...sourceIds];
}

/** 根据一组依赖来源合并当前内容的可见性，删除原因优先于失权原因。 */
function resolveHistoryContentVisibility(
  sourceIds: readonly string[],
  sourceVisibilities: AiHistorySourceVisibilityMap,
): AiHistoryContentVisibility {
  let revoked = false;

  for (const sourceId of new Set(sourceIds)) {
    const reason = sourceVisibilities.has(sourceId)
      ? sourceVisibilities.get(sourceId)
      : 'SOURCE_DELETED';
    if (reason === 'SOURCE_DELETED') {
      return { state: 'HIDDEN', reason };
    }
    if (reason === 'SOURCE_ACCESS_REVOKED') {
      revoked = true;
    }
  }

  return revoked
    ? { state: 'HIDDEN', reason: 'SOURCE_ACCESS_REVOKED' }
    : VISIBLE_HISTORY_CONTENT;
}

/** 汇总一批消息记录中需要在同一事务内批量重新鉴权的稳定来源 ID。 */
export function collectAiThreadHistorySourceIds(
  records: readonly AiThreadMessageHistoryRecord[],
): string[] {
  const sourceIds = new Set<string>();

  for (const record of records) {
    record.generatedByRun?.sourceDependencies.forEach((dependency) => {
      sourceIds.add(dependency.sourceId);
    });
    record.generatedByRun?.toolCalls.forEach((toolCall) => {
      extractToolDependencySourceIds(toolCall).forEach((sourceId) => {
        sourceIds.add(sourceId);
      });
    });
    record.answerRuns.forEach((run) => {
      run.sourceDependencies.forEach((dependency) => {
        sourceIds.add(dependency.sourceId);
      });
      run.toolCalls.forEach((toolCall) => {
        extractToolDependencySourceIds(toolCall).forEach((sourceId) => {
          sourceIds.add(sourceId);
        });
      });
    });
  }

  return [...sourceIds];
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

/** 把隐藏工具调用缩减为仅支持稳定排序和中性占位的非业务元数据。 */
function toHiddenAiToolCall(
  record: AiThreadMessageHistoryRecord['answerRuns'][number]['toolCalls'][number],
  visibility: Extract<AiHistoryContentVisibility, { state: 'HIDDEN' }>,
): AiHistoryToolCall {
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
    errorCode: record.errorCode,
    startedAt: record.startedAt?.toISOString() ?? null,
    finishedAt: record.finishedAt?.toISOString() ?? null,
    durationMs: record.durationMs,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    visibility,
  };
}

/** 按消息来源可见性返回完整正文或不含正文的助手占位。 */
function toHistoryMessage(
  record: AiThreadMessageHistoryRecord,
  sourceVisibilities: AiHistorySourceVisibilityMap,
): AiHistoryMessage {
  const sourceIds =
    record.role === 'ASSISTANT'
      ? [
          ...(record.generatedByRun?.sourceDependencies.map(
            (dependency) => dependency.sourceId,
          ) ?? []),
          ...(record.generatedByRun?.toolCalls.flatMap(
            extractToolDependencySourceIds,
          ) ?? []),
        ]
      : [];
  const visibility = resolveHistoryContentVisibility(
    sourceIds,
    sourceVisibilities,
  );

  if (record.role === 'ASSISTANT' && visibility.state === 'HIDDEN') {
    return {
      id: record.id,
      threadId: record.threadId,
      runId: record.runId,
      authorUserId: record.authorUserId,
      role: 'ASSISTANT',
      createdAt: record.createdAt.toISOString(),
      visibility,
    };
  }

  return { ...toAiMessage(record), visibility: VISIBLE_HISTORY_CONTENT };
}

/** 把一条消息及其 Run 重试链映射为稳定的历史恢复部件。 */
export function toAiThreadMessageHistoryItem(
  record: AiThreadMessageHistoryRecord,
  sourceVisibilities: AiHistorySourceVisibilityMap,
): AiThreadMessageHistoryItem {
  return {
    message: toHistoryMessage(record, sourceVisibilities),
    runs: record.answerRuns.map((runRecord) => {
      const toolCalls = runRecord.toolCalls.map((toolCall) => {
        const visibility = resolveHistoryContentVisibility(
          extractToolDependencySourceIds(toolCall),
          sourceVisibilities,
        );
        return visibility.state === 'HIDDEN'
          ? toHiddenAiToolCall(toolCall, visibility)
          : { ...toSafeAiToolCall(toolCall), visibility };
      });
      const citationSourceIds = [
        ...new Set(
          runRecord.sourceDependencies.map((dependency) => dependency.sourceId),
        ),
      ];
      const citationVisibility = resolveHistoryContentVisibility(
        citationSourceIds,
        sourceVisibilities,
      );

      return {
        run: toAiRunPublicSummary(runRecord),
        toolCalls,
        citations:
          citationVisibility.state === 'HIDDEN'
            ? { visibility: citationVisibility }
            : {
                visibility: citationVisibility,
                sourceIds: citationSourceIds,
              },
      };
    }),
  };
}
