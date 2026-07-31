/**
 * 本文件管理分区聊天历史分页、乐观发送、决策关联、实时合并和断线补偿。
 */
'use client';

import { useRef, useState } from 'react';
import type {
  CreateProjectChatMessageRequestPayload,
  ProjectChatMessage,
  ProjectChatMessagePage,
  ProjectUserSummary,
} from '@workspace/contracts/projects';

import { createProjectChatMessage, getProjectChatMessages } from '../../services/projects-client.service';
import { useProjectChatRealtime } from './use-project-chat-realtime';

/** 消息在浏览器的投递状态。 */
export type ProjectChatDeliveryStatus = 'sent' | 'sending' | 'failed';

/** 服务端消息附加本地投递状态。 */
export type ProjectChatViewMessage = ProjectChatMessage & {
  deliveryStatus: ProjectChatDeliveryStatus;
  errorMessage?: string;
};

/** 分区聊天 Hook 参数。 */
type UseProjectChatOptions = {
  projectId: number;
  areaId: number;
  initialPage: ProjectChatMessagePage;
  currentUser: ProjectUserSummary;
  canSend: boolean;
  /** 可选的消息来源会议；只在发送时写入，不改变分区聊天的读取范围。 */
  sourceMeetingId?: number;
  initialDecisionId?: number;
  onAccessRevoked: () => void;
};

/** 统一管理 HTTP 真源和 Socket 实时推送。 */
export function useProjectChat(options: UseProjectChatOptions) {
  const { projectId, areaId, initialPage, currentUser, canSend, sourceMeetingId, initialDecisionId, onAccessRevoked } =
    options;
  const [messages, setMessages] = useState<ProjectChatViewMessage[]>(() => initialPage.items.map(toSent));
  const [historyCursor, setHistoryCursor] = useState(initialPage.nextCursor);
  const [hasMoreHistory, setHasMoreHistory] = useState(initialPage.hasMore);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ProjectChatMessage | null>(null);
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
      const page = await getProjectChatMessages(projectId, areaId, {
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
    const payload: CreateProjectChatMessageRequestPayload = {
      clientMessageId: crypto.randomUUID(),
      content: trimmed,
      ...(replyTo ? { replyToId: replyTo.id } : {}),
      ...(sourceMeetingId ? { meetingId: sourceMeetingId } : {}),
      ...(initialDecisionId ? { decisionId: initialDecisionId } : {}),
    };
    const optimistic = createOptimistic(optimisticIdRef.current--, projectId, areaId, payload, currentUser, replyTo);
    setMessages((current) => [...current, optimistic]);
    setReplyTo(null);
    void persist(payload);
    return true;
  }

  /** 提交真正消息并替换乐观记录。 */
  async function persist(payload: CreateProjectChatMessageRequestPayload): Promise<void> {
    try {
      const saved = await createProjectChatMessage(projectId, areaId, payload);
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
  function mergeRealtimeMessage(message: ProjectChatMessage): void {
    if (initialDecisionId !== undefined && message.decision?.id !== initialDecisionId) return;
    maxIdRef.current = Math.max(maxIdRef.current, message.id);
    setMessages((current) => mergeMessages(current, [toSent(message)]));
  }

  /** 每次重连后从最大消息主键补齐断线期间内容。 */
  async function recoverMissedMessages(): Promise<void> {
    const page = await getProjectChatMessages(projectId, areaId, {
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

  const connectionStatus = useProjectChatRealtime({
    projectId,
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
  projectId: number,
  areaId: number,
  payload: CreateProjectChatMessageRequestPayload,
  currentUser: ProjectUserSummary,
  replyTo: ProjectChatMessage | null,
): ProjectChatViewMessage {
  return {
    id,
    projectId,
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
function toSent(message: ProjectChatMessage): ProjectChatViewMessage {
  return { ...message, deliveryStatus: 'sent' };
}

/** 按主键和幂等键合并消息并保持时间顺序。 */
function mergeMessages(left: ProjectChatViewMessage[], right: ProjectChatViewMessage[]): ProjectChatViewMessage[] {
  const map = new Map<string, ProjectChatViewMessage>();
  [...left, ...right].forEach((message) =>
    map.set(message.clientMessageId ? `client:${message.clientMessageId}` : `id:${message.id}`, message),
  );
  return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
}

/** 读取当前最大持久化消息主键。 */
function maxMessageId(messages: ProjectChatMessage[]): number {
  return messages.reduce((max, message) => Math.max(max, message.id), 0);
}
