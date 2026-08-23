/**
 * 本文件定义 AI Thread 中用于展示和审计的持久化消息共享契约。
 * 工具调用、引用和流式增量使用独立记录，不混入消息正文结构。
 */

import type { AiRunPublicSummary } from './ai-run.types.ts';
import type { AiToolCall } from './ai-tool.types.ts';

/** 第一版 AI 会话允许持久化的消息角色。 */
export const AI_MESSAGE_ROLES = ['USER', 'ASSISTANT'] as const;

/** AI 持久化消息的发送方角色。 */
export type AiMessageRole = (typeof AI_MESSAGE_ROLES)[number];

/** Thread 中一条具有稳定标识的用户或助手消息。 */
export type AiMessage = {
  /** 对外稳定的消息标识。 */
  id: string;
  /** 消息所属 Thread 标识。 */
  threadId: string;
  /** 生成助手消息的 Run 标识；用户消息固定为 `null`。 */
  runId: string | null;
  /** 用户消息作者主键；助手消息固定为 `null`。 */
  authorUserId: number | null;
  /** 消息由用户提交还是由助手生成。 */
  role: AiMessageRole;
  /** 用于历史展示和审计的完整文本正文。 */
  content: string;
  /** 消息创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
};

/** 一次用户消息对应的单次 Run、工具调用和稳定来源关联。 */
export type AiThreadMessageRunHistory = {
  /** 不包含执行租约或其他内部 fencing 字段的 Run 摘要。 */
  run: AiRunPublicSummary;
  /** 严格按工具调用序号恢复的持久化工具调用。 */
  toolCalls: AiToolCall[];
  /** 从本 Run 工具结果摘要中提取并去重的稳定业务来源 ID。 */
  sourceIds: string[];
};

/** 消息历史页中的一条消息及其发起的全部 Run 尝试。 */
export type AiThreadMessageHistoryItem = {
  /** 用于历史展示和审计的持久化消息。 */
  message: AiMessage;
  /**
   * 以当前用户消息作为原始请求的全部 Run，按 `createdAt`、Run UUID 正序排列。
   * 助手消息不发起 Run，因此该数组为空；助手消息仍通过 `message.runId` 关联生成它的 Run。
   */
  runs: AiThreadMessageRunHistory[];
};

/** AI Thread 消息历史的游标分页查询。 */
export type ListAiThreadMessagesQuery = {
  /** 服务端生成的不透明分页游标；首屏省略。 */
  cursor?: string;
  /** 单页消息数量，服务端默认 30 且最大 100。 */
  limit?: number;
};

/** AI Thread 消息历史的一页稳定结果。 */
export type AiThreadMessagePage = {
  /** 当前页按 `createdAt`、消息 UUID 正序排列的消息。 */
  items: AiThreadMessageHistoryItem[];
  /** 继续加载更早消息的不透明游标；没有更多数据时为空。 */
  nextCursor: string | null;
  /** 当前 Thread 是否仍有更早的持久化消息。 */
  hasMore: boolean;
};
