/**
 * 本文件从 UI 消息中选择受硬预算限制的最近纯文本消息供 Agent 使用。
 */
import type { ModelMessage, UIMessage } from 'ai';

import { AI_RECENT_MESSAGE_CHARACTER_BUDGET, AI_RECENT_MESSAGE_LIMIT } from './context-budget.server.ts';

/** 选取结果同时记录截断信息，便于后续观测而不保存消息正文日志。 */
export type AiAgentContextSelection = {
  /** 可直接交给 AI SDK Agent 的最近消息。 */
  messages: ModelMessage[];
  /** 原始消息是否因条数或字符预算被截断。 */
  truncated: boolean;
  /** 真正注入模型的 Unicode 字符数。 */
  selectedCharacters: number;
};

/** 从后向前选择最近消息，保证当前用户问题优先进入上下文。 */
export function buildAiAgentContext(uiMessages: UIMessage[]): AiAgentContextSelection {
  const candidates = uiMessages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      text: message.parts
        .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
        .map((part) => part.text)
        .join('\n')
        .trim(),
    }))
    .filter((message) => message.text.length > 0);
  const selected: typeof candidates = [];
  let selectedCharacters = 0;
  let contentTruncated = false;

  for (const candidate of candidates.slice().reverse()) {
    const characters = Array.from(candidate.text);
    const characterCount = characters.length;

    if (
      selected.length >= AI_RECENT_MESSAGE_LIMIT ||
      selectedCharacters + characterCount > AI_RECENT_MESSAGE_CHARACTER_BUDGET
    ) {
      if (selected.length === 0) {
        const truncatedText = characters.slice(0, AI_RECENT_MESSAGE_CHARACTER_BUDGET).join('');
        selected.unshift({ ...candidate, text: truncatedText });
        selectedCharacters = Array.from(truncatedText).length;
        contentTruncated = characters.length > AI_RECENT_MESSAGE_CHARACTER_BUDGET;
      }
      break;
    }

    selected.unshift(candidate);
    selectedCharacters += characterCount;
  }

  return {
    messages: selected.map((message) => ({ role: message.role, content: message.text })),
    truncated: contentTruncated || selected.length < candidates.length,
    selectedCharacters,
  };
}
