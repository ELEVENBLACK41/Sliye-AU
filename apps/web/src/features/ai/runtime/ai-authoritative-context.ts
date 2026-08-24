/**
 * 本文件把 NestJS 持久化消息转换为 Agent 上下文允许使用的最小 UIMessage 结构。
 */

import type { UIMessage } from 'ai';
import type { AiHistoryMessage, AiMessage } from '@workspace/contracts/ai';

/** Agent 上下文既可接收刚创建的消息，也可接收已完成细粒度鉴权的历史消息。 */
type AiAuthoritativeContextMessage = AiMessage | AiHistoryMessage;

/** 判断消息正文是否通过历史可见性复核且可以进入模型上下文。 */
function hasVisibleMessageContent(
  message: AiAuthoritativeContextMessage,
): message is AiMessage | Extract<AiHistoryMessage, { content: string }> {
  return (
    (!('visibility' in message) || message.visibility.state === 'VISIBLE') &&
    'content' in message &&
    message.content.trim().length > 0
  );
}

/** 按输入顺序把权威消息映射为只含纯文本的模型上下文。 */
export function toAiContextUiMessages(messages: readonly AiAuthoritativeContextMessage[]): UIMessage[] {
  return messages.filter(hasVisibleMessageContent).map((message) => ({
    id: message.id,
    role: message.role === 'USER' ? 'user' : 'assistant',
    parts: [{ type: 'text', text: message.content }],
  }));
}
