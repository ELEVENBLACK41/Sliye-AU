/** 本文件提供 AI 工作区消息分页结果的纯数据转换。 */

import type { AiMessageHistoryItem } from '@workspace/contracts/ai';

/**
 * 合并更早消息与当前消息，并按创建时间正序去重。
 *
 * 消息游标向更早方向加载，不能以新页覆盖当前已展示的消息。
 */
export function mergeAiWorkspaceMessages(
  olderMessages: AiMessageHistoryItem[],
  currentMessages: AiMessageHistoryItem[],
): AiMessageHistoryItem[] {
  const messages = new Map<string, AiMessageHistoryItem>();
  [...olderMessages, ...currentMessages].forEach((message) => messages.set(message.id, message));

  return [...messages.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
