/**
 * 本文件管理分区聊天历史分页、乐观发送、决策关联、实时合并和断线补偿。
 */
'use client';

import { useRef, useState } from 'react';
import type {
  CreateMatterChatMessageRequestPayload,
  MatterChatMessage,
  MatterChatMessagePage,
  MatterUserSummary,
} from '@workspace/contracts/matters';

import { createMatterChatMessage, getMatterChatMessages } from '../../services/matters-client.service';
import { useMatterChatRealtime } from './use-matter-chat-realtime';

/** 消息在浏览器的投递状态。 */
export type MatterChatDeliveryStatus = 'sent' | 'sending' | 'failed';

/** 服务端消息附加本地投递状态。 */
export type MatterChatViewMessage = MatterChatMessage & {
  deliveryStatus: MatterChatDeliveryStatus;
  errorMessage?: string;
};

/** 分区聊天 Hook 参数。 */
type UseMatterChatOptions = {
  matterId: number;
  areaId: number;
  initialPage: MatterChatMessagePage;
  currentUser: MatterUserSummary;
  canSend: boolean;
  /** 可选的消息来源会议；只在发送时写入，不改变分区聊天的读取范围。 */
  sourceMeetingId?: number;
  initialDecisionId?: number;
  onAccessRevoked: () => void;
};

/** 统一管理 HTTP 真源和 Socket 实时推送。 */
export function useMatterChat(options: UseMatterChatOptions) {
  const { matterId, areaId, initialPage, currentUser, canSend, sourceMeetingId, initialDecisionId, onAccessRevoked } =
    options;
  const [messages, setMessages] = useState<MatterChatViewMessage[]>(() => initialPage.items.map(toSent));
  const [historyCursor, setHistoryCursor] = useState(initialPage.nextCursor);
  const [hasMoreHistory, setHasMoreHistory] = useState(initialPage.hasMore);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<MatterChatMessage | null>(null);
  const maxIdRef = useRef(maxMessageId(initialPage.items));
  const optimisticIdRef = useRef(-1);
  const loadingRef = useRef(false);

  /** 加载更早历史并合并去重。 */
  async function loadOlderMessages(): Promise<void> {
    if (!hasMoreHistory || historyCursor === null || loadingRef.current) return;
    loadingRef.current = true;
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const page = await getMatterChatMessages(matterId, areaId, {
        direction: 'before',
        cursor: historyCursor,
        limit: 30,
        ...(initialDecisionId ? { decisionId: initialDecisionId } : {}),
      });
      setMessages((current) => mergeMessages(page.items.map(toSent), current));
      setHistoryCursor(page.nextCursor);
      setHasMoreHistory(page.hasMore);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : '更早消息加载失败');
    } finally {
      loadingRef.current = false;
      setIsLoadingHistory(false);
    }
  }

  /** 乐观入队并发送消息。 */
  function sendMessage(content: string): boolean {
    const trimmed = content.trim();
    if (!canSend || !trimmed || trimmed.length > 2000) return false;
    const payload: CreateMatterChatMessageRequestPayload = {
      clientMessageId: crypto.randomUUID(),
      content: trimmed,
      ...(replyTo ? { replyToId: replyTo.id } : {}),
      ...(sourceMeetingId ? { meetingId: sourceMeetingId } : {}),
      ...(initialDecisionId ? { decisionId: initialDecisionId } : {}),
    };
    const optimistic = createOptimistic(optimisticIdRef.current--, matterId, areaId, payload, currentUser, replyTo);
    setMessages((current) => [...current, optimistic]);
    setReplyTo(null);
    void persist(payload);
    return true;
  }

  /** 提交真正消息并替换乐观记录。 */
  async function persist(payload: CreateMatterChatMessageRequestPayload): Promise<void> {
    try {
      const saved = await createMatterChatMessage(matterId, areaId, payload);
      mergeRealtimeMessage(saved);
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.clientMessageId === payload.clientMessageId
            ? {
                ...message,
                deliveryStatus: 'failed',
                errorMessage: error instanceof Error ? error.message : '发送失败',
              }
            : message,
        ),
      );
    }
  }

  /** 合并持久化实时消息或替换乐观记录。 */
  function mergeRealtimeMessage(message: MatterChatMessage): void {
    if (initialDecisionId !== undefined && message.decision?.id !== initialDecisionId) return;
    maxIdRef.current = Math.max(maxIdRef.current, message.id);
    setMessages((current) => mergeMessages(current, [toSent(message)]));
  }

  /** 每次重连后从最大消息主键补齐断线期间内容。 */
  async function recoverMissedMessages(): Promise<void> {
    const page = await getMatterChatMessages(matterId, areaId, {
      direction: 'after',
      cursor: maxIdRef.current || undefined,
      limit: 50,
      ...(initialDecisionId ? { decisionId: initialDecisionId } : {}),
    });
    page.items.forEach((message) => {
      maxIdRef.current = Math.max(maxIdRef.current, message.id);
    });
    setMessages((current) => mergeMessages(current, page.items.map(toSent)));
  }

  const connectionStatus = useMatterChatRealtime({
    matterId,
    areaId,
    onMessage: mergeRealtimeMessage,
    onConnected: recoverMissedMessages,
    onRevoked: onAccessRevoked,
  });

  return {
    messages,
    hasMoreHistory,
    isLoadingHistory,
    historyError,
    replyTo,
    connectionStatus,
    loadOlderMessages,
    setReplyTo,
    clearReply: () => setReplyTo(null),
    sendMessage,
  };
}

/** 创建一条本地乐观消息。 */
function createOptimistic(
  id: number,
  matterId: number,
  areaId: number,
  payload: CreateMatterChatMessageRequestPayload,
  currentUser: MatterUserSummary,
  replyTo: MatterChatMessage | null,
): MatterChatViewMessage {
  return {
    id,
    matterId,
    areaId,
    clientMessageId: payload.clientMessageId,
    type: 'TEXT',
    content: payload.content,
    author: currentUser,
    replyTo: replyTo
      ? { id: replyTo.id, author: replyTo.author, content: replyTo.content, deletedAt: replyTo.deletedAt }
      : null,
    meetingId: payload.meetingId ?? null,
    decision: payload.decisionId ? { id: payload.decisionId, title: '关联决策' } : null,
    pinnedAt: null,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    deliveryStatus: 'sending',
  };
}

/** 把持久化消息标记为发送成功。 */
function toSent(message: MatterChatMessage): MatterChatViewMessage {
  return { ...message, deliveryStatus: 'sent' };
}

/** 按主键和幂等键合并消息并保持时间顺序。 */
function mergeMessages(left: MatterChatViewMessage[], right: MatterChatViewMessage[]): MatterChatViewMessage[] {
  const map = new Map<string, MatterChatViewMessage>();
  [...left, ...right].forEach((message) =>
    map.set(message.clientMessageId ? `client:${message.clientMessageId}` : `id:${message.id}`, message),
  );
  return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
}

/** 读取当前最大持久化消息主键。 */
function maxMessageId(messages: MatterChatMessage[]): number {
  return messages.reduce((max, message) => Math.max(max, message.id), 0);
}
