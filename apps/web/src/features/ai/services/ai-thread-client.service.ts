/**
 * 本文件封装 AI 会话在浏览器侧的全部只读查询与元数据变更请求。
 *
 * 只负责调用自身 BFF（`/api/ai/**`）并复用 contracts 的请求/响应类型，
 * 不做权限判断、不改写响应内容：数据范围与来源失权投影都由 NestJS 强制，
 * 在前端再写一套规则必然与服务端漂移。
 */

import type {
  AiRunControlResult,
  AiMessageListQuery,
  AiMessagePage,
  AiPinnedThreadList,
  AiThreadMessageSubmissionResult,
  AiThreadDetail,
  AiThreadListItem,
  AiThreadListQuery,
  AiThreadPage,
  AiThreadRunCommandResult,
  CreateAiThreadMessageRequest,
  CreateAiThreadRequest,
  RetryAiRunRequest,
} from '@workspace/contracts/ai';

import { requestData } from '@/services/request';

/** 把可选查询参数序列化为查询字符串，跳过未提供的项。 */
function toSearchParams(query: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) searchParams.set(key, String(value));
  });
  const serialized = searchParams.toString();

  return serialized.length > 0 ? `?${serialized}` : '';
}

/** 按游标读取一页未固定会话；首屏省略游标。 */
export function getAiThreadPage(query: AiThreadListQuery = {}, signal?: AbortSignal): Promise<AiThreadPage> {
  return requestData<AiThreadPage>(`/api/ai/threads${toSearchParams({ ...query })}`, {
    signal,
    errorMessage: 'AI 会话列表加载失败，请稍后重试',
  });
}

/** 一次性读取全部固定会话；固定数量有上限，因此没有分页。 */
export function getAiPinnedThreads(signal?: AbortSignal): Promise<AiPinnedThreadList> {
  return requestData<AiPinnedThreadList>('/api/ai/threads/pinned', {
    signal,
    errorMessage: '固定会话加载失败，请稍后重试',
  });
}

/** 读取单条会话详情与当前活跃 Run 快照，用于深链接恢复。 */
export function getAiThreadDetail(threadId: string, signal?: AbortSignal): Promise<AiThreadDetail> {
  return requestData<AiThreadDetail>(`/api/ai/threads/${encodeURIComponent(threadId)}`, {
    signal,
    errorMessage: 'AI 会话详情加载失败，请稍后重试',
  });
}

/** 按游标读取一页消息历史；返回项按时间正序，可直接渲染。 */
export function getAiMessagePage(
  threadId: string,
  query: AiMessageListQuery = {},
  signal?: AbortSignal,
): Promise<AiMessagePage> {
  return requestData<AiMessagePage>(
    `/api/ai/threads/${encodeURIComponent(threadId)}/messages${toSearchParams({ ...query })}`,
    {
      signal,
      errorMessage: 'AI 消息历史加载失败，请稍后重试',
    },
  );
}

/** 创建新 AI Thread，并提交首条用户消息。 */
export function createAiThread(
  body: CreateAiThreadRequest,
): Promise<AiThreadRunCommandResult> {
  return requestData<AiThreadRunCommandResult, CreateAiThreadRequest>('/api/ai/threads', {
    method: 'POST',
    body,
    errorMessage: 'AI 会话创建失败，请稍后重试',
  });
}

/** 在既有 Thread 中提交用户消息，普通模式由服务端决定立即执行或进入队列。 */
export function createAiThreadMessage(
  threadId: string,
  body: CreateAiThreadMessageRequest,
): Promise<AiThreadMessageSubmissionResult> {
  return requestData<AiThreadMessageSubmissionResult, CreateAiThreadMessageRequest>(
    `/api/ai/threads/${encodeURIComponent(threadId)}/messages`,
    {
      method: 'POST',
      body,
      errorMessage: 'AI 消息发送失败，请稍后重试',
    },
  );
}

/** 请求停止当前 Run；调用方继续等待 SSE 或历史状态确认最终终态。 */
export function stopAiRun(runId: string): Promise<AiRunControlResult> {
  return requestData<AiRunControlResult>(`/api/ai/runs/${encodeURIComponent(runId)}/stop`, {
    method: 'POST',
    errorMessage: 'AI 运行停止失败，请稍后重试',
  });
}

/** 从失败或取消的旧 Run 创建新的重试 Run。 */
export function retryAiRun(runId: string, body: RetryAiRunRequest): Promise<AiThreadRunCommandResult> {
  return requestData<AiThreadRunCommandResult, RetryAiRunRequest>(
    `/api/ai/runs/${encodeURIComponent(runId)}/retry`,
    {
      method: 'POST',
      body,
      errorMessage: 'AI 运行重试失败，请稍后重试',
    },
  );
}

/** 固定或取消固定一个会话；重复设置为同一状态是幂等的。 */
export function setAiThreadPinned(threadId: string, pinned: boolean): Promise<AiThreadListItem> {
  return requestData<AiThreadListItem>(`/api/ai/threads/${encodeURIComponent(threadId)}/pinned`, {
    method: 'PUT',
    body: { pinned },
    errorMessage: '会话固定状态更新失败，请稍后重试',
  });
}

/** 重命名会话；不会改变会话在“最近”列表中的排序位置。 */
export function renameAiThread(threadId: string, title: string): Promise<AiThreadListItem> {
  return requestData<AiThreadListItem>(`/api/ai/threads/${encodeURIComponent(threadId)}/title`, {
    method: 'PUT',
    body: { title },
    errorMessage: '会话重命名失败，请稍后重试',
  });
}

/** 归档或恢复会话；归档要求会话当前没有正在执行的运行。 */
export function setAiThreadArchived(threadId: string, archived: boolean): Promise<AiThreadListItem> {
  return requestData<AiThreadListItem>(`/api/ai/threads/${encodeURIComponent(threadId)}/archived`, {
    method: 'PUT',
    body: { archived },
    errorMessage: '会话归档状态更新失败，请稍后重试',
  });
}
