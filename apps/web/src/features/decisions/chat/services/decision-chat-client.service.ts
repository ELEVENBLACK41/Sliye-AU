/**
 * 本文件封装浏览器到 Next.js BFF 的决策群聊消息查询与发送请求。
 */
import type {
  CreateDecisionChatMessageRequest,
  DecisionChatMessage,
  DecisionChatMessageListQuery,
  DecisionChatMessagePage,
} from '@workspace/contracts/decisions';

import { requestData } from '@/services/request';

/** 查询决策群聊历史消息或补齐指定游标后的新消息。 */
export function getDecisionChatMessages(
  decisionId: number,
  query: DecisionChatMessageListQuery = {},
): Promise<DecisionChatMessagePage> {
  const searchParams = createMessageSearchParams(query);
  const queryString = searchParams.size > 0 ? `?${searchParams}` : '';

  return requestData<DecisionChatMessagePage>(`/api/decisions/${decisionId}/messages${queryString}`, {
    method: 'GET',
    errorMessage: '群聊消息加载失败，请稍后重试',
  });
}

/** 幂等发送一条决策群聊文字消息。 */
export function createDecisionChatMessage(
  decisionId: number,
  payload: CreateDecisionChatMessageRequest,
): Promise<DecisionChatMessage> {
  return requestData<DecisionChatMessage, CreateDecisionChatMessageRequest>(`/api/decisions/${decisionId}/messages`, {
    method: 'POST',
    body: payload,
    errorMessage: '消息发送失败，请稍后重试',
  });
}

/** 把可选游标查询条件转换为 URL 查询参数。 */
function createMessageSearchParams(query: DecisionChatMessageListQuery): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (query.direction) {
    searchParams.set('direction', query.direction);
  }
  if (query.cursor !== undefined) {
    searchParams.set('cursor', String(query.cursor));
  }
  if (query.limit !== undefined) {
    searchParams.set('limit', String(query.limit));
  }

  return searchParams;
}
