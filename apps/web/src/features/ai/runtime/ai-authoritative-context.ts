/**
 * 本文件把 NestJS 持久化消息转换为 Agent 上下文允许使用的最小 UIMessage 结构。
 */

import type { UIMessage } from 'ai';
import type { AiMessage } from '@workspace/contracts/ai';

/** 按输入顺序把权威消息映射为只含纯文本的模型上下文。 */
export function toAiContextUiMessages(messages: readonly AiMessage[]): UIMessage[] {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({
      id: message.id,
      role: message.role === 'USER' ? 'user' : 'assistant',
      parts: [{ type: 'text', text: message.content }],
    }));
}
