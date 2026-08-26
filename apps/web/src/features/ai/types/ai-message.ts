/**
 * 本文件定义持久化 AI 消息适配到现有聊天画布时使用的浏览器展示模型。
 *
 * 该模型保留服务端的可见性和 Run 状态，避免 UI 根据“是否有正文”猜测
 * 回答是否完成；工具调用仍使用服务端返回的受控摘要，不携带工具原始输出。
 */

import type { AiMessageRun } from '@workspace/contracts/ai';

/** 现有消息气泡可以直接消费的用户或助手角色。 */
export type AiWorkspaceMessageRole = 'user' | 'assistant';

/** 一条已经适配为聊天画布展示模型的 AI 消息。 */
export type AiWorkspaceMessage = {
  /** 消息稳定标识；实时助手消息也沿用服务端的 messageId。 */
  id: string;
  /** 消息在聊天画布中的角色。 */
  role: AiWorkspaceMessageRole;
  /** 当前用户可见的消息正文；失权消息由适配层替换为中性占位。 */
  content: string;
  /** 当前消息的正文可见性。 */
  contentVisibility: 'VISIBLE' | 'SOURCE_REVOKED';
  /** 助手消息的 Run 展示快照；用户消息为 null。 */
  run: AiMessageRun | null;
  /** 当前正文是否来自仍在接收领域事件的 Run。 */
  isStreaming: boolean;
};
