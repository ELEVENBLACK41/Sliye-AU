/**
 * 本文件定义 AI Thread 中用于展示和审计的持久化消息共享契约。
 * 工具调用、引用和流式增量使用独立记录，不混入消息正文结构。
 */

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
