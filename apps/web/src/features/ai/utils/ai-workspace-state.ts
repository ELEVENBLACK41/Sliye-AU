/**
 * 本文件提供 AI 工作区的纯状态守卫、列表合并和串行轮询工具。
 */

import type { AiThreadDetail, AiThreadListItem } from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';

import type { AiRunRequestContext } from './ai-chat-session';

/** Thread 业务来源失权后统一展示的安全提示，不复用可能携带旧业务信息的异常正文。 */
export const AI_THREAD_SCOPE_CHANGED_MESSAGE = 'AI 会话权限范围已变化，原有内容已停止显示';

/** 读取浏览器 ApiClientError 或 BFF AiNestRequestError 携带的稳定业务码。 */
function readAiThreadErrorCode(error: unknown): unknown {
  if (!error || typeof error !== 'object') return null;
  if ('code' in error) return error.code;
  if ('response' in error && error.response && typeof error.response === 'object' && 'code' in error.response) {
    return error.response.code;
  }
  return null;
}

/** 通过稳定领域错误码判断 Thread 是否必须整体停止展示。 */
export function isAiThreadScopeChangedError(error: unknown): boolean {
  return readAiThreadErrorCode(error) === API_ERROR_CODES.AI_THREAD_SCOPE_CHANGED;
}

/** 把范围变化编码为 AI SDK 能透传的统一 JSON 错误文本，其他错误返回空。 */
export function serializeAiThreadScopeChangedError(error: unknown): string | null {
  if (!isAiThreadScopeChangedError(error)) return null;
  return JSON.stringify({
    code: API_ERROR_CODES.AI_THREAD_SCOPE_CHANGED,
    message: AI_THREAD_SCOPE_CHANGED_MESSAGE,
  });
}

/** 只有 Thread 与权限失效代次都未变化时，异步读取结果才允许进入当前工作区。 */
export function canApplyAiThreadRequestResult(
  threadId: string,
  currentThreadId: string | null,
  requestScopeVersion: number,
  currentScopeVersion: number,
): boolean {
  return threadId === currentThreadId && requestScopeVersion === currentScopeVersion;
}

/** 合并 Thread 分页时按稳定 ID 去重，并保留后端返回顺序。 */
export function mergeAiThreadListItems(
  current: AiThreadListItem[],
  incoming: AiThreadListItem[],
): AiThreadListItem[] {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    merged.set(item.id, item);
  }
  return [...merged.values()];
}

/** 把 Thread 详情转换为列表允许消费的相同安全字段。 */
export function toAiThreadListItem(detail: AiThreadDetail): AiThreadListItem {
  return { ...detail };
}

/** 判断异步 Run 回调是否仍属于当前工作区会话和 Thread。 */
export function isCurrentAiWorkspaceRun(
  context: AiRunRequestContext,
  currentSessionId: string,
  currentThreadId: string | null,
): boolean {
  return context.sessionId === currentSessionId && context.threadId === currentThreadId;
}

/** 判断快照能否用于旧 Run 的结算；新的活跃 Run 不允许被旧回调覆盖。 */
export function canApplyAiRunSettlementSnapshot(
  context: AiRunRequestContext,
  currentSessionId: string,
  currentThreadId: string | null,
  activeRunId: string | null,
): boolean {
  return (
    isCurrentAiWorkspaceRun(context, currentSessionId, currentThreadId) &&
    (activeRunId === null || activeRunId === context.runId)
  );
}

/** 以等待后刷新、刷新完成后再等待的顺序轮询，保证请求最大并发为一。 */
export async function runSerialAiActiveRunPoll({
  shouldContinue,
  wait,
  refresh,
}: {
  shouldContinue: () => boolean;
  wait: () => Promise<void>;
  refresh: () => Promise<void>;
}): Promise<void> {
  while (shouldContinue()) {
    await wait();
    if (!shouldContinue()) return;
    await refresh();
  }
}

/** 等待短暂数据库收敛，不承担第 10 阶段的长任务恢复职责。 */
export function waitForAiAuthoritativeState(delayMs = 250): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

/** 提取浏览器请求的稳定用户消息，未知异常使用固定兜底。 */
export function toAiWorkspaceErrorMessage(error: unknown, fallback: string): string {
  if (isAiThreadScopeChangedError(error)) {
    return AI_THREAD_SCOPE_CHANGED_MESSAGE;
  }

  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
