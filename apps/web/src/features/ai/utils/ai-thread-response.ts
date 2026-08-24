/**
 * 本文件在浏览器服务边界校验 AI Thread 历史摘要，避免旧版 NestJS 响应进入组件后造成白屏。
 */

import type { AiRunStatus, AiThreadListItem, AiThreadPage } from '@workspace/contracts/ai';

/** 历史接口与当前 Web 契约不一致时展示的稳定处理提示。 */
export const AI_THREAD_HISTORY_CONTRACT_ERROR_MESSAGE = 'AI 会话历史数据版本不兼容，请重启 NestJS 服务后重试';
/** 已经进入组件的异常摘要使用中性文案，避免再次读取缺失字段。 */
export const AI_THREAD_SCOPE_LABEL_UNAVAILABLE = '会话范围信息不可用，请重新加载';

/** AI Thread 历史允许展示的全部 Run 状态。 */
const AI_THREAD_HISTORY_RUN_STATUSES = new Set<AiRunStatus>([
  'QUEUED',
  'RUNNING',
  'WAITING_APPROVAL',
  'CANCELLATION_REQUESTED',
  'CANCELLED',
  'COMPLETED',
  'FAILED',
]);

/** 校验 BFF 返回的历史页，拒绝缺少真实项目或决策信息的旧响应。 */
export function parseAiThreadPageResponse(value: unknown): AiThreadPage {
  if (!isRecord(value)) {
    throw new Error(AI_THREAD_HISTORY_CONTRACT_ERROR_MESSAGE);
  }

  const nextCursorIsValid = value.nextCursor === null || typeof value.nextCursor === 'string';
  if (
    !Array.isArray(value.items) ||
    !value.items.every(isAiThreadListItem) ||
    typeof value.hasMore !== 'boolean' ||
    !nextCursorIsValid
  ) {
    throw new Error(AI_THREAD_HISTORY_CONTRACT_ERROR_MESSAGE);
  }

  return value as AiThreadPage;
}

/** 安全生成项目与决策标签，为热更新前已存在的旧状态提供最后一道防崩溃保护。 */
export function getAiThreadScopeLabel(value: unknown): string {
  if (!isRecord(value) || !isOptionalBusinessLabel(value.project) || !isOptionalBusinessLabel(value.decision)) {
    return AI_THREAD_SCOPE_LABEL_UNAVAILABLE;
  }

  return value.project && value.decision
    ? `${value.project.title} · ${value.decision.title}`
    : '动态范围会话 · 每次提问按实时权限确定数据范围';
}

/** 确认一条历史摘要包含当前界面实际消费的全部真实字段。 */
function isAiThreadListItem(value: unknown): value is AiThreadListItem {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    isOptionalBusinessLabel(value.project) &&
    isOptionalBusinessLabel(value.decision) &&
    (value.activeRunId === null || typeof value.activeRunId === 'string') &&
    isLatestRun(value.latestRun) &&
    (value.archivedAt === null || typeof value.archivedAt === 'string') &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

/** 校验项目或决策的真实主键与非空标题。 */
function isBusinessLabel(value: unknown): value is { id: number; title: string } {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    Number.isInteger(value.id) &&
    value.id > 0 &&
    typeof value.title === 'string' &&
    value.title.trim().length > 0
  );
}

/** 允许 2.7 新会话没有固定业务绑定，同时继续严格校验 2.6 兼容摘要。 */
function isOptionalBusinessLabel(value: unknown): value is { id: number; title: string } | null {
  return value === null || isBusinessLabel(value);
}

/** 历史列表只消费最近 Run 的稳定状态，其余字段仍由共享契约约束。 */
function isLatestRun(value: unknown): value is AiThreadListItem['latestRun'] {
  return (
    value === null ||
    (isRecord(value) &&
      typeof value.status === 'string' &&
      AI_THREAD_HISTORY_RUN_STATUSES.has(value.status as AiRunStatus))
  );
}

/** 把未知值收窄为可安全读取键的普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
