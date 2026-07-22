/**
 * 本文件集中管理决策群聊的历史分页、一级回复、乐观发送和失败重试状态。
 */
'use client';

import { useRef, useState } from 'react';
import type {
  CreateDecisionChatMessageRequest,
  DecisionChatMessage,
  DecisionChatMessagePage,
  DecisionUserSummary,
} from '@workspace/contracts/decisions';

import { createDecisionChatMessage, getDecisionChatMessages } from '../services/decision-chat-client.service';

/** 页面展示的一条消息当前所处的本地投递状态。 */
export type DecisionChatDeliveryStatus = 'sent' | 'sending' | 'failed';

/** 在服务端消息契约上附加浏览器乐观投递状态。 */
export type DecisionChatViewMessage = DecisionChatMessage & {
  /** 当前消息在浏览器中的投递状态。 */
  deliveryStatus: DecisionChatDeliveryStatus;
  /** 最近一次发送失败时展示的安全错误文案。 */
  errorMessage?: string;
};

/** 决策群聊 Hook 初始化参数。 */
type UseDecisionChatOptions = {
  /** 当前决策主键。 */
  decisionId: number;
  /** Server Component 预取的最新消息页。 */
  initialPage: DecisionChatMessagePage;
  /** 当前登录用户的公开摘要，用于构造乐观消息。 */
  currentUser: DecisionUserSummary;
  /** 当前页面是否允许展示发送能力；最终权限仍由 NestJS 校验。 */
  canSend: boolean;
};

/** 管理纯 HTTP 群聊交互并向展示组件提供稳定操作入口。 */
export function useDecisionChat({ decisionId, initialPage, currentUser, canSend }: UseDecisionChatOptions) {
  const [messages, setMessages] = useState<DecisionChatViewMessage[]>(() => initialPage.items.map(toSentViewMessage));
  const [historyCursor, setHistoryCursor] = useState(initialPage.nextCursor);
  const [hasMoreHistory, setHasMoreHistory] = useState(initialPage.hasMore);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<DecisionChatMessage | null>(null);
  const isLoadingHistoryRef = useRef(false);
  const nextOptimisticIdRef = useRef(-1);

  /** 向前加载一页更早消息，并返回本次是否实际追加了数据。 */
  async function loadOlderMessages(): Promise<boolean> {
    if (!hasMoreHistory || historyCursor === null || isLoadingHistoryRef.current) {
      return false;
    }

    isLoadingHistoryRef.current = true;
    setIsLoadingHistory(true);
    setHistoryError(null);

    try {
      const page = await getDecisionChatMessages(decisionId, {
        direction: 'before',
        cursor: historyCursor,
        limit: 30,
      });

      setMessages((current) => mergeHistoryMessages(current, page.items));
      setHistoryCursor(page.nextCursor);
      setHasMoreHistory(page.hasMore);

      return page.items.length > 0;
    } catch (error) {
      setHistoryError(getErrorMessage(error, '更早消息加载失败，请稍后重试'));
      return false;
    } finally {
      isLoadingHistoryRef.current = false;
      setIsLoadingHistory(false);
    }
  }

  /** 选择一条已经落库的消息作为当前一级回复目标。 */
  function selectReply(message: DecisionChatViewMessage): void {
    if (!canSend || message.id < 1 || message.deliveryStatus !== 'sent') {
      return;
    }

    setReplyTo(message);
  }

  /** 清除当前一级回复目标。 */
  function clearReply(): void {
    setReplyTo(null);
  }

  /** 创建乐观消息并启动 HTTP 发送；有效内容成功入队时返回 `true`。 */
  function sendMessage(content: string): boolean {
    const trimmedContent = content.trim();

    if (!canSend || trimmedContent.length < 1 || trimmedContent.length > 2000) {
      return false;
    }

    const payload: CreateDecisionChatMessageRequest = {
      clientMessageId: crypto.randomUUID(),
      content: trimmedContent,
      ...(replyTo ? { replyToId: replyTo.id } : {}),
    };
    const optimisticMessage = createOptimisticMessage({
      id: nextOptimisticIdRef.current,
      payload,
      currentUser,
      spaceId: initialPage.items[0]?.spaceId ?? 0,
      replyTo,
    });

    nextOptimisticIdRef.current -= 1;
    setMessages((current) => [...current, optimisticMessage]);
    setReplyTo(null);
    void persistMessage(payload);

    return true;
  }

  /** 使用原 `clientMessageId` 重试失败消息，保证服务端幂等。 */
  function retryMessage(clientMessageId: string): void {
    const failedMessage = messages.find(
      (message) => message.clientMessageId === clientMessageId && message.deliveryStatus === 'failed',
    );

    if (!canSend || !failedMessage?.content) {
      return;
    }

    const payload: CreateDecisionChatMessageRequest = {
      clientMessageId,
      content: failedMessage.content,
      ...(failedMessage.replyTo ? { replyToId: failedMessage.replyTo.id } : {}),
    };

    setMessages((current) => updateDeliveryState(current, clientMessageId, 'sending'));
    void persistMessage(payload);
  }

  /** 把乐观消息提交到 BFF，按成功或失败结果更新原位置。 */
  async function persistMessage(payload: CreateDecisionChatMessageRequest): Promise<void> {
    try {
      const savedMessage = await createDecisionChatMessage(decisionId, payload);

      setMessages((current) => replaceOptimisticMessage(current, savedMessage));
    } catch (error) {
      setMessages((current) =>
        updateDeliveryState(current, payload.clientMessageId, 'failed', getErrorMessage(error, '消息发送失败，请重试')),
      );
    }
  }

  return {
    messages,
    hasMoreHistory,
    isLoadingHistory,
    historyError,
    replyTo,
    loadOlderMessages,
    selectReply,
    clearReply,
    sendMessage,
    retryMessage,
  };
}

/** 把服务端消息转换为已经成功投递的页面消息。 */
function toSentViewMessage(message: DecisionChatMessage): DecisionChatViewMessage {
  return { ...message, deliveryStatus: 'sent' };
}

/** 创建等待 HTTP 响应的本地乐观消息。 */
function createOptimisticMessage({
  id,
  payload,
  currentUser,
  spaceId,
  replyTo,
}: {
  /** 只在浏览器存在的负数消息主键。 */
  id: number;
  /** 即将提交给服务端的幂等请求。 */
  payload: CreateDecisionChatMessageRequest;
  /** 当前登录用户公开摘要。 */
  currentUser: DecisionUserSummary;
  /** 当前讨论空间主键；首屏没有消息时使用零占位。 */
  spaceId: number;
  /** 可选的一级回复目标。 */
  replyTo: DecisionChatMessage | null;
}): DecisionChatViewMessage {
  return {
    id,
    spaceId,
    clientMessageId: payload.clientMessageId,
    type: 'TEXT',
    content: payload.content,
    author: currentUser,
    replyTo: replyTo
      ? {
          id: replyTo.id,
          author: replyTo.author,
          content: replyTo.content,
          deletedAt: replyTo.deletedAt,
        }
      : null,
    meetingId: null,
    pinnedAt: null,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    deliveryStatus: 'sending',
  };
}

/** 把更早消息合并到列表头部，并按服务端主键和幂等键去重。 */
function mergeHistoryMessages(
  current: DecisionChatViewMessage[],
  incoming: DecisionChatMessage[],
): DecisionChatViewMessage[] {
  const persistedIds = new Set(current.filter((message) => message.id > 0).map((message) => message.id));
  const clientMessageIds = new Set(
    current.map((message) => message.clientMessageId).filter((value): value is string => Boolean(value)),
  );
  const olderMessages = incoming
    .filter(
      (message) =>
        !persistedIds.has(message.id) && (!message.clientMessageId || !clientMessageIds.has(message.clientMessageId)),
    )
    .map(toSentViewMessage);

  return [...olderMessages, ...current];
}

/** 用数据库真消息替换对应乐观消息，同时移除可能存在的重复记录。 */
function replaceOptimisticMessage(
  current: DecisionChatViewMessage[],
  savedMessage: DecisionChatMessage,
): DecisionChatViewMessage[] {
  let replaced = false;
  const result: DecisionChatViewMessage[] = [];

  for (const message of current) {
    if (message.id === savedMessage.id && message.id > 0) {
      continue;
    }

    if (message.clientMessageId === savedMessage.clientMessageId) {
      if (!replaced) {
        result.push(toSentViewMessage(savedMessage));
        replaced = true;
      }
      continue;
    }

    result.push(message);
  }

  if (!replaced) {
    result.push(toSentViewMessage(savedMessage));
  }

  return result;
}

/** 更新指定乐观消息的投递状态和可选失败原因。 */
function updateDeliveryState(
  current: DecisionChatViewMessage[],
  clientMessageId: string,
  deliveryStatus: DecisionChatDeliveryStatus,
  errorMessage?: string,
): DecisionChatViewMessage[] {
  return current.map((message) =>
    message.clientMessageId === clientMessageId
      ? {
          ...message,
          deliveryStatus,
          ...(errorMessage ? { errorMessage } : { errorMessage: undefined }),
        }
      : message,
  );
}

/** 从未知请求异常中提取可展示文案。 */
function getErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error && error.message ? error.message : fallbackMessage;
}
