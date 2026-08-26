/** 本文件提供 AI 工作区消息分页与实时 Run 状态的纯数据转换。 */

import type { AiMessageHistoryItem, AiMessageRun } from '@workspace/contracts/ai';

import type { AiWorkspaceMessage } from '../types/ai-message';
import type { AiWorkspaceQueuedMessage } from '../types/ai-workspace';
import type { AiEventReducerState } from './ai-event-reducer';

/** 服务端来源失权消息在浏览器侧使用的中性占位文案。 */
const REVOKED_MESSAGE_PLACEHOLDER = '这条回答当前无法显示。';

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

/**
 * 将历史消息和当前 Run 的实时快照适配为现有聊天画布模型。
 *
 * 服务端历史接口已经完成来源失权投影，因此失权消息不读取任何实时正文或工具
 * 快照；正常消息则以事件归约结果覆盖正在生成的助手正文，完成后仍可由下一次
 * 历史刷新得到同一条稳定消息。
 */
export function toAiWorkspaceMessages(
  history: AiMessageHistoryItem[],
  liveRun: AiEventReducerState | null,
): AiWorkspaceMessage[] {
  const messages = history
    .filter((message) => message.dispatchState !== 'QUEUED')
    .map(toWorkspaceMessage);

  if (!liveRun || !liveRun.status) {
    return messages;
  }

  const liveMessage = toLiveAssistantMessage(liveRun);
  if (!liveMessage) {
    return messages;
  }

  const existingIndex = messages.findIndex((message) => message.id === liveMessage.id);
  if (existingIndex === -1) {
    return [...messages, liveMessage];
  }

  const nextMessages = [...messages];
  const existingMessage = nextMessages[existingIndex];
  if (existingMessage.contentVisibility === 'SOURCE_REVOKED') {
    return nextMessages;
  }

  nextMessages[existingIndex] = {
    ...existingMessage,
    content: liveMessage.content || existingMessage.content,
    run: liveMessage.run,
    isStreaming: liveMessage.isStreaming,
  };

  return nextMessages;
}

/** 将历史与刚提交的本地确认结果合并为输入框上方的排队列表。 */
export function toAiWorkspaceQueuedMessages(
  history: AiMessageHistoryItem[],
  localQueuedMessages: AiWorkspaceQueuedMessage[],
  steeringRunId: string | null,
): AiWorkspaceQueuedMessage[] {
  const queuedMessages = new Map<string, AiWorkspaceQueuedMessage>();
  const localSteer = localQueuedMessages.find((message) => message.submissionMode === 'STEER');

  history
    .filter(
      (message) =>
        message.role === 'USER' &&
        message.dispatchState === 'QUEUED' &&
        (localSteer === undefined ||
          message.queueSequence === null ||
          message.queueSequence >= localSteer.queueSequence),
    )
    .forEach((message) => {
      if (message.queueSequence === null || message.submissionMode === null) return;

      queuedMessages.set(message.id, {
        id: message.id,
        content: message.content,
        queueSequence: message.queueSequence,
        submissionMode: message.submissionMode,
        isSteering: steeringRunId !== null,
      });
    });

  localQueuedMessages.forEach((message) => {
    queuedMessages.set(message.id, {
      ...message,
      isSteering: steeringRunId !== null,
    });
  });

  return [...queuedMessages.values()].sort((left, right) => left.queueSequence - right.queueSequence);
}

/** 将一条服务端历史消息转换为现有气泡可消费的角色和正文。 */
function toWorkspaceMessage(message: AiMessageHistoryItem): AiWorkspaceMessage {
  const isRevoked = message.contentVisibility === 'SOURCE_REVOKED';

  return {
    id: message.id,
    role: message.role === 'USER' ? 'user' : 'assistant',
    content: isRevoked ? REVOKED_MESSAGE_PLACEHOLDER : message.content,
    contentVisibility: message.contentVisibility,
    run: message.run,
    dispatchState: message.dispatchState,
    isStreaming: false,
  };
}

/** 把当前 Run 快照转换为一条可追加到历史末尾的实时助手消息。 */
function toLiveAssistantMessage(liveRun: AiEventReducerState): AiWorkspaceMessage | null {
  const hasLiveContent = liveRun.assistantText.length > 0 || liveRun.toolCalls.length > 0;
  const needsTerminalStatus = liveRun.status === 'CANCELLED' || liveRun.status === 'FAILED';

  if (!liveRun.assistantMessageId && !hasLiveContent && !needsTerminalStatus) {
    return null;
  }

  const run = toAiMessageRun(liveRun);

  return {
    id: liveRun.assistantMessageId ?? `live-assistant-${liveRun.runId}`,
    role: 'assistant',
    content: liveRun.assistantText,
    contentVisibility: 'VISIBLE',
    run,
    dispatchState: null,
    isStreaming: isLiveRun(liveRun),
  };
}

/** 将事件归约快照转换为历史接口使用的受控 Run 展示结构。 */
function toAiMessageRun(liveRun: AiEventReducerState): AiMessageRun {
  return {
    runId: liveRun.runId,
    status: liveRun.status ?? 'RUNNING',
    failureReason: liveRun.failureReason,
    failureCode: liveRun.failureCode,
    cancellationReason: liveRun.cancellationReason,
    toolCalls: liveRun.toolCalls.map((toolCall) => ({
      id: toolCall.id,
      toolName: toolCall.toolName,
      status: toolCall.status,
      durationMs: toolCall.durationMs,
      failureCode: toolCall.failureCode,
      failureReason: toolCall.failureReason,
    })),
  };
}

/** 判断实时快照是否仍处于需要流式表现的非终态。 */
function isLiveRun(liveRun: AiEventReducerState): boolean {
  return (
    liveRun.status === 'QUEUED' ||
    liveRun.status === 'RUNNING' ||
    liveRun.status === 'WAITING_APPROVAL' ||
    liveRun.status === 'CANCELLATION_REQUESTED'
  );
}
