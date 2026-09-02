/**
 * 本文件维护 C3 动态 Thread 的官方 useChat 状态和历史加载。
 *
 * 旧工作台仍由 useAiThreadWorkspace 提供回退；本 Hook 不引用旧 POST
 * Provider、领域事件 reducer 或实时 delta 适配器。
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type ChatStatus } from 'ai';
import type { AiThreadListItem } from '@workspace/contracts/ai';

import { useAiThreadLists } from '../components/ai-thread-list-provider';
import { useAiThreadMetadata } from './use-ai-thread-metadata';
import {
  getAiMessagePage,
  getAiThreadDetail,
} from '../services/ai-thread-client.service';
import type {
  AiWorkspaceCommandState,
  AiWorkspaceLoadState,
  AiWorkspaceStreamState,
  AiWorkspaceThreadPreview,
  AiWorkspaceThreadState,
} from '../types/ai-workspace';
import {
  createAiChatRequestBody,
  toAiWorkspaceMessagesFromChat,
  toNextNestWorkspaceAgentUIMessages,
} from '../utils/ai-chat-message';
import type { NextNestWorkspaceAgentUIMessage } from '../agents/nextnest-workspace-agent';

/** 没有历史详情时的空 Thread 状态。 */
const EMPTY_THREAD_STATE: AiWorkspaceThreadState = {
  thread: null,
  activeRun: null,
  messages: [],
  messageCursor: null,
  hasMoreMessages: false,
};

/** 从动态路由读取当前 Thread 标识。 */
function useRouteThreadId(): string | undefined {
  const params = useParams<{ threadId?: string | string[] }>();
  const value = params.threadId;

  return Array.isArray(value) ? value[0] : value;
}

/** 把列表项映射为侧栏需要的 URL 选中态。 */
function toThreadPreview(item: AiThreadListItem, threadId: string | undefined): AiWorkspaceThreadPreview {
  return { ...item, isActive: item.id === threadId };
}

/** 将 useChat 状态转换为现有工作台的标准连接状态。 */
function toWorkspaceStreamState(status: ChatStatus): AiWorkspaceStreamState {
  if (status === 'submitted') return 'CONNECTING';
  if (status === 'streaming') return 'CONNECTED';
  if (status === 'error') return 'ERROR';
  return 'IDLE';
}

/** 将 useChat 状态转换为现有输入框使用的命令生命周期。 */
function toWorkspaceCommandState(status: ChatStatus): AiWorkspaceCommandState {
  return status === 'submitted' || status === 'streaming' ? 'SUBMITTING' : 'IDLE';
}

/** 加载 Thread 历史并把官方 useChat 接入 C2 UI Message Stream。 */
export function useAiChat() {
  const router = useRouter();
  const threadId = useRouteThreadId();
  const { pinnedThreads, recentThreads, listState, listError, refreshThreadLists } = useAiThreadLists();
  const requestVersionRef = useRef(0);
  const [threadState, setThreadState] = useState<AiWorkspaceThreadState>(EMPTY_THREAD_STATE);
  const [threadLoadState, setThreadLoadState] = useState<AiWorkspaceLoadState>('LOADING');
  const [threadError, setThreadError] = useState<string | null>(null);
  const [messageLoadState, setMessageLoadState] = useState<AiWorkspaceLoadState>('LOADING');
  const [messageError, setMessageError] = useState<string | null>(null);

  const initialMessages = useMemo(
    () =>
      threadState.thread?.id === threadId && messageLoadState === 'SUCCESS'
        ? toNextNestWorkspaceAgentUIMessages(threadState.messages)
        : [],
    [messageLoadState, threadId, threadState.messages, threadState.thread?.id],
  );
  const transport = useMemo(
    () =>
      new DefaultChatTransport<NextNestWorkspaceAgentUIMessage>({
        api: '/api/ai/spike',
        prepareSendMessagesRequest: ({ messages }) => ({
          body: createAiChatRequestBody(threadId ?? '', messages),
        }),
      }),
    [threadId],
  );
  const {
    messages: chatMessages,
    status: chatStatus,
    error: chatError,
    sendMessage,
    stop,
    regenerate,
    setMessages,
  } = useChat<NextNestWorkspaceAgentUIMessage>({
    id: threadId ?? 'nextnest-ai-new-thread',
    messages: initialMessages,
    transport,
  });

  /** 路由变化时重新加载详情和文本历史，避免旧 Thread 消息留在新会话。 */
  useEffect(() => {
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    const controller = new AbortController();

    queueMicrotask(() => {
      if (controller.signal.aborted || requestVersion !== requestVersionRef.current) return;

      setThreadState(EMPTY_THREAD_STATE);
      setThreadLoadState('LOADING');
      setThreadError(null);
      setMessageLoadState('LOADING');
      setMessageError(null);
    });

    if (!threadId) {
      queueMicrotask(() => {
        if (controller.signal.aborted || requestVersion !== requestVersionRef.current) return;

        setThreadLoadState('IDLE');
        setMessageLoadState('IDLE');
      });
      return () => controller.abort();
    }

    void Promise.all([
      getAiThreadDetail(threadId, controller.signal),
      getAiMessagePage(threadId, {}, controller.signal),
    ])
      .then(([detail, page]) => {
        if (controller.signal.aborted || requestVersion !== requestVersionRef.current) return;

        setThreadState({
          thread: detail,
          activeRun: detail.activeRun,
          messages: page.items,
          messageCursor: page.nextCursor,
          hasMoreMessages: page.hasMore,
        });
        setThreadLoadState('SUCCESS');
        setMessageLoadState('SUCCESS');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestVersion !== requestVersionRef.current) return;

        const message = error instanceof Error && error.message ? error.message : 'AI 会话加载失败，请稍后重试';
        setThreadLoadState('ERROR');
        setThreadError(message);
        setMessageLoadState('ERROR');
        setMessageError(message);
      });

    return () => controller.abort();
  }, [threadId]);

  /** 历史请求完成后把文本级 UIMessage 同步给官方 Chat 状态。 */
  useEffect(() => {
    if (threadState.thread?.id !== threadId || messageLoadState !== 'SUCCESS') return;

    setMessages(toNextNestWorkspaceAgentUIMessages(threadState.messages));
  }, [messageLoadState, setMessages, threadId, threadState.messages, threadState.thread?.id]);

  const metadata = useAiThreadMetadata({ threadId, setThreadState, refreshThreadLists });

  /** 跳转到另一个动态 Thread；进入 `/ai` 会回到旧入口创建新会话。 */
  const selectThread = useCallback(
    (nextThreadId: string) => router.push(`/ai/${encodeURIComponent(nextThreadId)}`),
    [router],
  );

  /** 打开旧工作台的新会话入口，作为 C3 尚未迁移首条建会话流程的回退点。 */
  const startNewThread = useCallback(() => router.push('/ai'), [router]);

  /** 提交一条用户消息，官方 Chat 会把完整状态交给 UI Message Stream。 */
  const submitMessage = useCallback(
    async (message: string): Promise<boolean> => {
      const content = message.trim();
      if (!threadId || !content || chatStatus !== 'ready') return false;

      void sendMessage({ text: content });
      return true;
    },
    [chatStatus, sendMessage, threadId],
  );

  /** 中止当前浏览器 UI Message Stream；服务端后续停止语义留给 C6。 */
  const stopChat = useCallback(() => {
    stop();
  }, [stop]);

  /** 重新提交最近一轮用户消息，使用官方 Chat 的 regenerate 生命周期。 */
  const retryLastMessage = useCallback(() => {
    if (chatStatus !== 'error') return;
    void regenerate();
  }, [chatStatus, regenerate]);

  return {
    threadId,
    pinnedThreads: useMemo(
      () => pinnedThreads.map((thread) => toThreadPreview(thread, threadId)),
      [pinnedThreads, threadId],
    ),
    recentThreads: useMemo(
      () => recentThreads.map((thread) => toThreadPreview(thread, threadId)),
      [recentThreads, threadId],
    ),
    listState,
    listError,
    ...metadata,
    threadLoadState,
    threadError,
    messageLoadState,
    messageError,
    workspaceMessages: toAiWorkspaceMessagesFromChat(chatMessages, chatStatus),
    activeRunStatus: chatStatus === 'submitted' || chatStatus === 'streaming' ? ('RUNNING' as const) : null,
    streamState: toWorkspaceStreamState(chatStatus),
    chatError: chatError?.message ?? null,
    commandState: toWorkspaceCommandState(chatStatus),
    submitMessage,
    stopChat,
    retryLastMessage,
    selectThread,
    startNewThread,
  };
}
