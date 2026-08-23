/**
 * 本文件使用 Zod 校验浏览器提交给 AI 流式 BFF 的最小请求结构。
 */

import { z } from 'zod';

/** 去除用户标题首尾空白后再进入长度白名单。 */
function trimAiThreadTitle(value: string): string {
  return value.trim();
}

/** 按 Unicode 码点校验 Thread 标题长度。 */
function hasValidAiThreadTitleLength(value: string): boolean {
  const characterCount = Array.from(value).length;
  return characterCount >= 1 && characterCount <= 60;
}

/** 确认更新请求至少包含一个允许修改的字段。 */
function hasAiThreadUpdateField(value: { title?: string; archived?: boolean }): boolean {
  return value.title !== undefined || value.archived !== undefined;
}

/** 浏览器消息只校验提取当前用户文本所需的最小公开结构。 */
const aiIncomingUiMessageSchema = z
  .object({
    role: z.enum(['system', 'user', 'assistant']),
    parts: z.array(z.unknown()).max(200),
  })
  .loose();

/** BFF 允许从浏览器消息中读取的最小结构。 */
type AiIncomingUiMessage = z.infer<typeof aiIncomingUiMessageSchema>;

/** AI Thread 动态路由只接受标准 UUID，避免把任意路径片段透传给 NestJS。 */
export const aiThreadIdSchema = z.string().uuid();

/** AI Thread 消息历史 BFF 允许透传的分页查询白名单。 */
export const aiThreadMessagesQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

/** AI Thread 标题和归档状态 BFF 允许透传的更新白名单。 */
export const aiThreadUpdateRequestSchema = z
  .object({
    title: z
      .string()
      .transform(trimAiThreadTitle)
      .refine(hasValidAiThreadTitleLength)
      .optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine(hasAiThreadUpdateField);

/** 首次消息和后续消息共同使用的 UI 流请求 Schema。 */
export const aiChatStreamRequestSchema = z.object({
  decisionId: z.number().int().positive(),
  clientRequestId: z.string().uuid(),
  messages: z.array(aiIncomingUiMessageSchema).min(1).max(50),
});

/** 重试请求只需要幂等键，原用户消息从 NestJS 权威状态返回。 */
export const aiRetryStreamRequestSchema = z.object({
  clientRequestId: z.string().uuid(),
});

/** 从 UI 消息中提取当前非空用户文本。 */
export function getLatestUserMessageText(messages: AiIncomingUiMessage[]): string | null {
  const latest = messages.findLast((message) => message.role === 'user');

  if (!latest) {
    return null;
  }

  const text = latest.parts
    .filter(isIncomingTextPart)
    .map((part) => part.text)
    .join('\n')
    .trim();

  return text || null;
}

/** 只接受具有字符串正文的标准文本 part，忽略浏览器附带的其他结构。 */
function isIncomingTextPart(part: unknown): part is { type: 'text'; text: string } {
  return Boolean(
    part &&
      typeof part === 'object' &&
      (part as { type?: unknown }).type === 'text' &&
      typeof (part as { text?: unknown }).text === 'string',
  );
}
