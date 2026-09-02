/**
 * 本文件负责 C3 官方 useChat 工作台的 UIMessage 请求和展示适配。
 *
 * C4 完成 UIMessage parts 持久化前，历史消息只按纯文本恢复；实时工具状态
 * 直接消费 AI SDK 返回的 tool parts，不经过旧领域事件 reducer。
 */

import { isToolUIPart, type ChatStatus } from 'ai';
import type {
  AiMessageHistoryItem,
  AiMessageRun,
  AiMessageToolCall,
  AiRunStatus,
} from '@workspace/contracts/ai';

import type { NextNestWorkspaceAgentUIMessage } from '../agents/nextnest-workspace-agent';
import type { AiWorkspaceMessage } from '../types/ai-message';

/** 来源当前不可见时沿用既有工作台的中性占位文案。 */
const REVOKED_MESSAGE_PLACEHOLDER = '这条回答当前无法显示。';

/** 把 useChat 当前消息请求压缩为 C2 Route 需要的 Thread 与最后一条消息。 */
export function createAiChatRequestBody(
  threadId: string,
  messages: NextNestWorkspaceAgentUIMessage[],
): { threadId: string; message: NextNestWorkspaceAgentUIMessage } {
  const message = messages[messages.length - 1];

  if (!message || message.role !== 'user') {
    throw new Error('AI 对话请求缺少最后一条用户消息');
  }

  return { threadId, message };
}

/** 把现有历史接口的文本投影转换为官方 Agent UIMessage。 */
export function toNextNestWorkspaceAgentUIMessages(
  history: AiMessageHistoryItem[],
): NextNestWorkspaceAgentUIMessage[] {
  return history
    .filter((message) => message.dispatchState !== 'QUEUED')
    .map((message) => ({
      id: message.id,
      role: message.role === 'USER' ? 'user' : 'assistant',
      parts: [
        {
          type: 'text' as const,
          text:
            message.contentVisibility === 'SOURCE_REVOKED'
              ? REVOKED_MESSAGE_PLACEHOLDER
              : message.content,
        },
      ],
    }));
}

/** 把 AI SDK 工具 part 映射成现有工具卡可消费的最小审计摘要。 */
function toAiMessageToolCall(
  part: Extract<
    NextNestWorkspaceAgentUIMessage['parts'][number],
    { type: `tool-${string}` | 'dynamic-tool'; toolCallId: string; state: string }
  >,
): AiMessageToolCall {
  const isSucceeded = part.state === 'output-available';
  const isFailed = part.state === 'output-error';

  return {
    id: part.toolCallId,
    toolName: part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length),
    status: isSucceeded ? 'SUCCEEDED' : isFailed ? 'FAILED' : 'RUNNING',
    failureCode: null,
    failureReason: isFailed ? part.errorText : null,
    durationMs: null,
  };
}

/** 根据 useChat 状态生成旧展示模型所需的轻量 Run 状态。 */
function toAiMessageRun(
  message: NextNestWorkspaceAgentUIMessage,
  status: ChatStatus,
  isLatest: boolean,
): AiMessageRun | null {
  if (message.role !== 'assistant') return null;

  const toolParts = message.parts.filter(isToolUIPart);
  const isFailedLatestMessage = isLatest && status === 'error';
  if (toolParts.length === 0 && !isFailedLatestMessage) return null;

  const runId = `chat-message-${message.id}`;
  return {
    runId,
    status: isFailedLatestMessage ? 'FAILED' : toAiRunStatus(status),
    failureReason: isFailedLatestMessage ? 'MODEL_ERROR' : null,
    failureCode: null,
    cancellationReason: null,
    toolCalls: toolParts.map((part) => toAiMessageToolCall(part)),
  };
}

/** 将 useChat 生命周期映射到既有工作台使用的运行状态。 */
function toAiRunStatus(status: ChatStatus): AiRunStatus {
  return status === 'submitted' || status === 'streaming' ? 'RUNNING' : 'COMPLETED';
}

/** 提取 UIMessage 中的文本 parts，保留 Markdown 原文交给 MessageResponse 渲染。 */
function getUiMessageText(message: NextNestWorkspaceAgentUIMessage): string {
  return message.parts
    .filter(
      (part): part is Extract<NextNestWorkspaceAgentUIMessage['parts'][number], { type: 'text' }> =>
        part.type === 'text',
    )
    .map((part) => part.text)
    .join('');
}

/** 将 useChat 的官方消息状态映射到现有 AI Elements 画布模型。 */
export function toAiWorkspaceMessagesFromChat(
  messages: NextNestWorkspaceAgentUIMessage[],
  status: ChatStatus,
): AiWorkspaceMessage[] {
  return messages.flatMap((message, index) => {
    if (message.role === 'system') return [];

    const isLatest = index === messages.length - 1;
    const run = toAiMessageRun(message, status, isLatest);

    return [
      {
        id: message.id,
        role: message.role,
        content: getUiMessageText(message),
        contentVisibility: 'VISIBLE',
        run,
        dispatchState: null,
        isStreaming: isLatest && message.role === 'assistant' && status === 'streaming',
      },
    ];
  });
}
