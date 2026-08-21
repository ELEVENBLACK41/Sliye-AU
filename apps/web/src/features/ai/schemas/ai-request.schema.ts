/**
 * 本文件使用 Zod 校验浏览器提交给 AI 流式 BFF 的最小请求结构。
 */

import type { UIMessage } from 'ai';
import { z } from 'zod';

/** 首次消息和后续消息共同使用的 UI 流请求 Schema。 */
export const aiChatStreamRequestSchema = z.object({
  decisionId: z.number().int().positive(),
  clientRequestId: z.string().uuid(),
  messages: z.array(z.custom<UIMessage>()).min(1).max(50),
});

/** 重试请求只需要幂等键，原用户消息从 NestJS 权威状态返回。 */
export const aiRetryStreamRequestSchema = z.object({
  clientRequestId: z.string().uuid(),
});

/** 从 UI 消息中提取当前非空用户文本。 */
export function getLatestUserMessageText(messages: UIMessage[]): string | null {
  const latest = messages.findLast((message) => message.role === 'user');

  if (!latest) {
    return null;
  }

  const text = latest.parts
    .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();

  return text || null;
}
