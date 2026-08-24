/**
 * 本文件封装浏览器到 Next.js BFF 的 AI Thread 历史、详情与管理请求。
 */

import type {
  AiRunScopeResolutionResponse,
  AiThreadDetail,
  AiThreadMessageHistoryItem,
  AiThreadMessagePage,
  AiThreadPage,
  ListAiThreadMessagesQuery,
  ListAiThreadsQuery,
  UpdateAiThreadRequest,
  UpdateAiThreadResponse,
} from '@workspace/contracts/ai';

import { requestData } from '@/services/request';

import { parseAiThreadPageResponse } from '../utils/ai-thread-response';

/** Thread 详情与最新消息页的同代快照。 */
export type AiThreadSnapshot = {
  /** 当前 Thread 详情。 */
  detail: AiThreadDetail;
  /** 最新一页消息。 */
  items: AiThreadMessageHistoryItem[];
  /** 更早消息游标。 */
  nextCursor: string | null;
  /** 是否仍有更早消息。 */
  hasMore: boolean;
};

/** 分页读取当前用户仍有权访问的 AI 会话历史。 */
export async function listAiThreadHistory(query: ListAiThreadsQuery): Promise<AiThreadPage> {
  const searchParams = new URLSearchParams();

  if (query.cursor) {
    searchParams.set('cursor', query.cursor);
  }
  if (query.archiveState) {
    searchParams.set('archiveState', query.archiveState);
  }
  if (query.decisionId !== undefined) {
    searchParams.set('decisionId', String(query.decisionId));
  }
  if (query.limit !== undefined) {
    searchParams.set('limit', String(query.limit));
  }

  const suffix = searchParams.size > 0 ? `?${searchParams}` : '';
  const response = await requestData<unknown>(`/api/ai/threads${suffix}`, {
    method: 'GET',
    errorMessage: 'AI 会话历史获取失败，请稍后重试',
  });

  return parseAiThreadPageResponse(response);
}

/** 读取指定 AI Thread 的安全业务详情。 */
export function getAiThreadDetail(threadId: string): Promise<AiThreadDetail> {
  return requestData<AiThreadDetail>(`/api/ai/threads/${encodeURIComponent(threadId)}`, {
    method: 'GET',
    errorMessage: 'AI 会话详情获取失败，请稍后重试',
  });
}

/** 分页读取指定 Thread 的持久化消息、运行、工具调用与来源关联。 */
export function getAiThreadMessages(threadId: string, query: ListAiThreadMessagesQuery): Promise<AiThreadMessagePage> {
  const searchParams = new URLSearchParams();

  if (query.cursor) {
    searchParams.set('cursor', query.cursor);
  }
  if (query.limit !== undefined) {
    searchParams.set('limit', String(query.limit));
  }

  const suffix = searchParams.size > 0 ? `?${searchParams}` : '';
  return requestData<AiThreadMessagePage>(`/api/ai/threads/${encodeURIComponent(threadId)}/messages${suffix}`, {
    method: 'GET',
    errorMessage: 'AI 会话消息获取失败，请稍后重试',
  });
}

/** 并行读取 Thread 详情与最新消息页，供深链接恢复和状态轮询使用。 */
export async function getAiThreadSnapshot(threadId: string, messageLimit: number): Promise<AiThreadSnapshot> {
  const [detail, page] = await Promise.all([
    getAiThreadDetail(threadId),
    getAiThreadMessages(threadId, { limit: messageLimit }),
  ]);

  return {
    detail,
    items: page.items,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}

/** 读取仍在排队的 Run 范围，用于刷新后恢复候选确认或继续执行入口。 */
export function getAiRunScopeResolution(runId: string): Promise<AiRunScopeResolutionResponse> {
  return requestData<AiRunScopeResolutionResponse>(`/api/ai/runs/${encodeURIComponent(runId)}/scope`, {
    method: 'GET',
    errorMessage: 'AI 决策范围恢复失败，请稍后重试',
  });
}

/** 使用用户补充的名称重新发现同一条排队 Run 的授权范围。 */
export function rediscoverAiRunScope(runId: string, query: string): Promise<AiRunScopeResolutionResponse> {
  return requestData<AiRunScopeResolutionResponse, { query: string }>(
    `/api/ai/runs/${encodeURIComponent(runId)}/scope/discover`,
    {
      method: 'POST',
      body: { query },
      errorMessage: 'AI 决策范围查找失败，请稍后重试',
    },
  );
}

/** 通过 BFF 白名单更新指定 Thread 的标题或归档状态。 */
export function updateAiThread(threadId: string, request: UpdateAiThreadRequest): Promise<UpdateAiThreadResponse> {
  return requestData<UpdateAiThreadResponse, UpdateAiThreadRequest>(`/api/ai/threads/${encodeURIComponent(threadId)}`, {
    method: 'PATCH',
    body: request,
    errorMessage: 'AI 会话更新失败，请稍后重试',
  });
}
