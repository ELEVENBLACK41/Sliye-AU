/**
 * 本文件维护 AI Thread 工作区的只读路由数据。
 *
 * 2.6-A 只负责列表、详情和首屏消息；发送、运行控制与 SSE 由后续增量接入。
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import type { AiThreadListItem } from '@workspace/contracts/ai';

import {
  getAiMessagePage,
  getAiPinnedThreads,
  getAiThreadDetail,
  getAiThreadPage,
} from '../services/ai-thread-client.service';
import type {
  AiWorkspaceLoadState,
  AiWorkspaceThreadPreview,
  AiWorkspaceThreadState,
} from '../types/ai-workspace';
import { mergeAiWorkspaceMessages } from '../utils/ai-workspace-message';

/** 空工作区的初始 Thread 数据，避免新会话误显示为加载失败。 */
const EMPTY_THREAD_STATE: AiWorkspaceThreadState = {
  thread: null,
  activeRun: null,
  messages: [],
  messageCursor: null,
  hasMoreMessages: false,
};

/** 将服务端列表项映射为由 URL 驱动选中态的侧栏数据。 */
function toThreadPreview(item: AiThreadListItem, threadId: string | undefined): AiWorkspaceThreadPreview {
  return { ...item, isActive: item.id === threadId };
}

/** 读取动态路由中的 Thread 标识；未提供时表示新会话工作区。 */
function useRouteThreadId(): string | undefined {
  const params = useParams<{ threadId?: string | string[] }>();
  const value = params.threadId;

  return Array.isArray(value) ? value[0] : value;
}

/**
 * 加载并管理当前 AI 工作区的只读资源。
 *
 * 每次 Thread 路由变化都会中止旧详情/消息请求并清空旧状态，避免慢请求覆盖新会话。
 */
export function useAiThreadWorkspace() {
  const router = useRouter();
  const threadId = useRouteThreadId();
  const requestVersionRef = useRef(0);
  const [pinnedThreads, setPinnedThreads] = useState<AiThreadListItem[]>([]);
  const [recentThreads, setRecentThreads] = useState<AiThreadListItem[]>([]);
  const [listState, setListState] = useState<AiWorkspaceLoadState>('LOADING');
  const [listError, setListError] = useState<string | null>(null);
  const [threadState, setThreadState] = useState<AiWorkspaceThreadState>(EMPTY_THREAD_STATE);
  const [threadLoadState, setThreadLoadState] = useState<AiWorkspaceLoadState>('IDLE');
  const [threadError, setThreadError] = useState<string | null>(null);
  const [messageLoadState, setMessageLoadState] = useState<AiWorkspaceLoadState>('IDLE');
  const [messageError, setMessageError] = useState<string | null>(null);

  /** 跳转到 URL 唯一标识的目标会话，不在本地保存当前会话副本。 */
  const selectThread = useCallback(
    (nextThreadId: string) => {
      router.push(`/ai/${encodeURIComponent(nextThreadId)}`);
    },
    [router],
  );

  /** 返回无 Thread 标识的新会话工作区；首条消息创建由 2.6-C 接入。 */
  const startNewThread = useCallback(() => {
    router.push('/ai');
  }, [router]);

  /** 使用当前游标补充更早消息，并保持服务端已定义的时间正序。 */
  const loadMoreMessages = useCallback(async () => {
    if (!threadId || !threadState.hasMoreMessages || !threadState.messageCursor) return;
    const requestVersion = requestVersionRef.current;

    setMessageLoadState('LOADING');
    setMessageError(null);

    try {
      const page = await getAiMessagePage(threadId, { cursor: threadState.messageCursor });
      if (requestVersion !== requestVersionRef.current) return;
      setThreadState((current) => ({
        ...current,
        messages: mergeAiWorkspaceMessages(page.items, current.messages),
        messageCursor: page.nextCursor,
        hasMoreMessages: page.hasMore,
      }));
      setMessageLoadState('SUCCESS');
    } catch (error) {
      if (requestVersion !== requestVersionRef.current) return;
      setMessageLoadState('ERROR');
      setMessageError(toErrorMessage(error, '更早消息加载失败，请稍后重试'));
    }
  }, [threadId, threadState.hasMoreMessages, threadState.messageCursor]);

  /** 首次加载固定和最近列表；列表失败不影响深链接详情的加载。 */
  useEffect(() => {
    const controller = new AbortController();

    void Promise.all([getAiPinnedThreads(controller.signal), getAiThreadPage({}, controller.signal)])
      .then(([pinnedPage, recentPage]) => {
        setPinnedThreads(pinnedPage.items);
        setRecentThreads(recentPage.items);
        setListState('SUCCESS');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setListState('ERROR');
        setListError(toErrorMessage(error, 'AI 会话列表加载失败，请稍后重试'));
      });

    return () => controller.abort();
  }, []);

  /** 路由切换时并发加载详情与首屏消息，并拒绝旧请求写回当前工作区。 */
  useEffect(() => {
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    const controller = new AbortController();

    queueMicrotask(() => {
      if (requestVersion !== requestVersionRef.current) return;
      setThreadState(EMPTY_THREAD_STATE);
      setThreadError(null);
      setMessageError(null);
    });

    if (!threadId) {
      queueMicrotask(() => {
        if (requestVersion !== requestVersionRef.current) return;
        setThreadLoadState('IDLE');
        setMessageLoadState('IDLE');
      });
      return () => controller.abort();
    }

    queueMicrotask(() => {
      if (requestVersion !== requestVersionRef.current) return;
      setThreadLoadState('LOADING');
      setMessageLoadState('LOADING');
    });

    void getAiThreadDetail(threadId, controller.signal)
      .then((detail) => {
        if (requestVersion !== requestVersionRef.current) return;
        setThreadState((current) => ({ ...current, thread: detail, activeRun: detail.activeRun }));
        setThreadLoadState('SUCCESS');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestVersion !== requestVersionRef.current) return;
        setThreadLoadState('ERROR');
        setThreadError(toErrorMessage(error, 'AI 会话加载失败，请稍后重试'));
      });

    void getAiMessagePage(threadId, {}, controller.signal)
      .then((page) => {
        if (requestVersion !== requestVersionRef.current) return;
        setThreadState((current) => ({
          ...current,
          messages: page.items,
          messageCursor: page.nextCursor,
          hasMoreMessages: page.hasMore,
        }));
        setMessageLoadState('SUCCESS');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestVersion !== requestVersionRef.current) return;
        setMessageLoadState('ERROR');
        setMessageError(toErrorMessage(error, 'AI 消息历史加载失败，请稍后重试'));
      });

    return () => controller.abort();
  }, [threadId]);

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
    threadState,
    threadLoadState,
    threadError,
    messageLoadState,
    messageError,
    selectThread,
    startNewThread,
    loadMoreMessages,
  };
}

/** 从未知异常中提取可安全展示的错误文案。 */
function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
