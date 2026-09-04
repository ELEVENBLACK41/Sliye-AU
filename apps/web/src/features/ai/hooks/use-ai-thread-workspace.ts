/**
 * 本文件协调 AI Thread 的路由加载、持久化消息、命令与实时运行状态。
 * 客户端投影状态统一保存在 Zustand Store；URL、服务端历史与领域事件仍是权威来源。
 */
'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { AI_RUN_STATUSES, type AiThreadListItem } from '@workspace/contracts/ai';

import { useAiThreadLists } from '../components/ai-thread-list-provider';
import { getAiMessagePage, getAiThreadDetail } from '../services/ai-thread-client.service';
import { subscribeToAiRunStream, type AiRunStreamStatus } from '../services/ai-thread-stream.service';
import { useAiThreadWorkspaceStore } from '../store/ai-thread-workspace.store';
import type { AiWorkspaceThreadPreview } from '../types/ai-workspace';
import {
  applyAiRunSnapshot,
  createAiEventReducerState,
  isAiRunTerminal,
  reduceAiEvent,
  type AiEventReducerState,
} from '../utils/ai-event-reducer';
import { mergeAiWorkspaceMessages, toAiWorkspaceQueuedMessages } from '../utils/ai-workspace-message';
import { useAiThreadCommands } from './use-ai-thread-commands';
import { useAiThreadMetadata } from './use-ai-thread-metadata';

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

/** 加载并管理当前 AI 工作区的 Thread、消息、Run 和会话命令资源。 */
export function useAiThreadWorkspace() {
  const router = useRouter();
  const threadId = useRouteThreadId();
  const { pinnedThreads, recentThreads, listState, listError, refreshThreadLists } = useAiThreadLists();
  const threadState = useAiThreadWorkspaceStore((state) => state.threadState);
  const threadLoadState = useAiThreadWorkspaceStore((state) => state.threadLoadState);
  const threadError = useAiThreadWorkspaceStore((state) => state.threadError);
  const messageLoadState = useAiThreadWorkspaceStore((state) => state.messageLoadState);
  const messageError = useAiThreadWorkspaceStore((state) => state.messageError);
  const runEventState = useAiThreadWorkspaceStore((state) => state.runEventState);
  const streamState = useAiThreadWorkspaceStore((state) => state.streamState);
  const streamError = useAiThreadWorkspaceStore((state) => state.streamError);
  const postStreamRunId = useAiThreadWorkspaceStore((state) => state.postStreamRunId);
  const localQueuedMessages = useAiThreadWorkspaceStore((state) => state.localQueuedMessages);
  const steeringRunId = useAiThreadWorkspaceStore((state) => state.steeringRunId);
  const updateThreadState = useAiThreadWorkspaceStore((state) => state.updateThreadState);
  const setThreadLoadState = useAiThreadWorkspaceStore((state) => state.setThreadLoadState);
  const setThreadError = useAiThreadWorkspaceStore((state) => state.setThreadError);
  const setMessageLoadState = useAiThreadWorkspaceStore((state) => state.setMessageLoadState);
  const setMessageError = useAiThreadWorkspaceStore((state) => state.setMessageError);
  const updateRunEventState = useAiThreadWorkspaceStore((state) => state.updateRunEventState);
  const setStreamState = useAiThreadWorkspaceStore((state) => state.setStreamState);
  const setStreamError = useAiThreadWorkspaceStore((state) => state.setStreamError);
  const setSteeringRunId = useAiThreadWorkspaceStore((state) => state.setSteeringRunId);
  const updateLocalQueuedMessages = useAiThreadWorkspaceStore((state) => state.updateLocalQueuedMessages);
  const markThreadRunStatus = useAiThreadWorkspaceStore((state) => state.markThreadRunStatus);
  const markThreadActivitySeen = useAiThreadWorkspaceStore((state) => state.markThreadActivitySeen);
  const resetForRouteChange = useAiThreadWorkspaceStore((state) => state.resetForRouteChange);
  const isCurrentRequestVersion = useAiThreadWorkspaceStore((state) => state.isCurrentRequestVersion);

  /** 重新读取当前 Thread 的详情和最新消息，让刷新结果成为命令后的权威状态。 */
  const refreshCurrentThread = useCallback(async () => {
    if (!threadId) return;

    const requestVersion = useAiThreadWorkspaceStore.getState().requestVersion;

    try {
      const [detail, page] = await Promise.all([getAiThreadDetail(threadId), getAiMessagePage(threadId)]);
      if (!isCurrentRequestVersion(requestVersion)) return;

      const nextRunEventState = detail.activeRun
        ? createAiEventReducerState(detail.activeRun.runId, { status: detail.activeRun.status })
        : null;
      if (detail.activeRun) {
        markThreadRunStatus(threadId, detail.activeRun.runId, detail.activeRun.status);
      }
      updateRunEventState(nextRunEventState);
      updateThreadState({
        thread: detail,
        activeRun: detail.activeRun,
        messages: page.items,
        messageCursor: page.nextCursor,
        hasMoreMessages: page.hasMore,
      });
      setThreadLoadState('SUCCESS');
      setMessageLoadState('SUCCESS');
      setMessageError(null);
      updateLocalQueuedMessages([]);
      setSteeringRunId(null);
    } catch (error: unknown) {
      if (!isCurrentRequestVersion(requestVersion)) return;
      setThreadError(toErrorMessage(error, 'AI 会话刷新失败，请稍后重试'));
    }
  }, [
    isCurrentRequestVersion,
    setMessageError,
    setMessageLoadState,
    setSteeringRunId,
    setThreadError,
    setThreadLoadState,
    threadId,
    updateLocalQueuedMessages,
    updateRunEventState,
    updateThreadState,
    markThreadRunStatus,
  ]);

  const metadata = useAiThreadMetadata(threadId);

  /** 跳转到 URL 唯一标识的目标会话，不在本地保存当前会话副本。 */
  const selectThread = useCallback(
    (nextThreadId: string) => {
      markThreadActivitySeen(nextThreadId);
      router.push(`/ai/${encodeURIComponent(nextThreadId)}`);
    },
    [markThreadActivitySeen, router],
  );

  /** 返回无 Thread 标识的新会话工作区；首条消息由命令入口创建 Thread。 */
  const startNewThread = useCallback(() => {
    router.push('/ai');
  }, [router]);

  /** 使用当前游标补充更早消息，并保持服务端已定义的时间正序。 */
  const loadMoreMessages = useCallback(async () => {
    if (!threadId || !threadState.hasMoreMessages || !threadState.messageCursor) return;
    const requestVersion = useAiThreadWorkspaceStore.getState().requestVersion;

    setMessageLoadState('LOADING');
    setMessageError(null);

    try {
      const page = await getAiMessagePage(threadId, { cursor: threadState.messageCursor });
      if (!isCurrentRequestVersion(requestVersion)) return;
      updateThreadState((current) => ({
        ...current,
        messages: mergeAiWorkspaceMessages(page.items, current.messages),
        messageCursor: page.nextCursor,
        hasMoreMessages: page.hasMore,
      }));
      setMessageLoadState('SUCCESS');
    } catch (error) {
      if (!isCurrentRequestVersion(requestVersion)) return;
      setMessageLoadState('ERROR');
      setMessageError(toErrorMessage(error, '更早消息加载失败，请稍后重试'));
    }
  }, [
    isCurrentRequestVersion,
    setMessageError,
    setMessageLoadState,
    threadId,
    threadState.hasMoreMessages,
    threadState.messageCursor,
    updateThreadState,
  ]);

  /** 路由切换时并发加载详情与首屏消息，并拒绝旧请求写回当前工作区。 */
  useEffect(() => {
    const requestVersion = resetForRouteChange();
    const controller = new AbortController();

    if (!threadId) {
      setThreadLoadState('IDLE');
      setMessageLoadState('IDLE');
      return () => controller.abort();
    }

    setThreadLoadState('LOADING');
    setMessageLoadState('LOADING');

    void getAiThreadDetail(threadId, controller.signal)
      .then((detail) => {
        if (!isCurrentRequestVersion(requestVersion)) return;
        const currentRunEventState = useAiThreadWorkspaceStore.getState().runEventState;
        const preservesPostStream =
          currentRunEventState !== null && (!detail.activeRun || detail.activeRun.runId === currentRunEventState.runId);
        const nextRunEventState = preservesPostStream
          ? currentRunEventState
          : detail.activeRun
            ? createAiEventReducerState(detail.activeRun.runId, { status: detail.activeRun.status })
            : null;
        if (detail.activeRun) {
          markThreadRunStatus(threadId, detail.activeRun.runId, detail.activeRun.status);
        }
        updateRunEventState(nextRunEventState);
        updateThreadState((current) => {
          const activeRun = preservesPostStream ? current.activeRun : detail.activeRun;
          const thread =
            preservesPostStream && currentRunEventState
              ? { ...detail, activeRunId: currentRunEventState.runId }
              : detail;
          return { ...current, thread, activeRun };
        });
        setThreadLoadState('SUCCESS');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || !isCurrentRequestVersion(requestVersion)) return;
        setThreadLoadState('ERROR');
        setThreadError(toErrorMessage(error, 'AI 会话加载失败，请稍后重试'));
      });

    void getAiMessagePage(threadId, {}, controller.signal)
      .then((page) => {
        if (!isCurrentRequestVersion(requestVersion)) return;
        updateThreadState((current) => ({
          ...current,
          messages: page.items,
          messageCursor: page.nextCursor,
          hasMoreMessages: page.hasMore,
        }));
        setMessageLoadState('SUCCESS');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || !isCurrentRequestVersion(requestVersion)) return;
        setMessageLoadState('ERROR');
        setMessageError(toErrorMessage(error, 'AI 消息历史加载失败，请稍后重试'));
      });

    return () => controller.abort();
  }, [
    isCurrentRequestVersion,
    markThreadRunStatus,
    resetForRouteChange,
    setMessageError,
    setMessageLoadState,
    setThreadError,
    setThreadLoadState,
    threadId,
    updateRunEventState,
    updateThreadState,
  ]);

  /** 将发送、停止和重试命令接入当前 Thread 的统一状态入口。 */
  const commands = useAiThreadCommands({ threadId, refreshCurrentThread, refreshThreadLists });

  /** 为当前详情中的活跃 Run 建立可恢复的标准领域 SSE 订阅。 */
  useEffect(() => {
    const activeRun = threadState.activeRun;
    const loadedThreadId = threadState.thread?.id;
    if (!threadId || !activeRun || loadedThreadId !== threadId || postStreamRunId === activeRun.runId) {
      return;
    }

    const currentThreadId = threadId;
    const activeRunSnapshot = activeRun;
    const runId = activeRunSnapshot.runId;
    let disposed = false;
    let terminal = false;
    let streamFailed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let retryAttempt = 0;
    let subscription: ReturnType<typeof subscribeToAiRunStream> | null = null;

    /** 获取当前 Run 的 reducer 状态；详情响应与流启动存在异步时序时补建初始状态。 */
    function ensureRunEventState(): AiEventReducerState {
      const current = useAiThreadWorkspaceStore.getState().runEventState;
      if (current?.runId === runId) {
        return current;
      }

      const next = createAiEventReducerState(runId, { status: activeRunSnapshot.status });
      updateRunEventState(next);
      return next;
    }

    /** 记录 reducer 新产生的开发期诊断，不改变用户可见完成状态。 */
    function logNewDiagnostics(previous: AiEventReducerState, next: AiEventReducerState): void {
      if (process.env.NODE_ENV === 'production') return;

      next.diagnostics
        .filter((diagnostic) => !previous.diagnostics.includes(diagnostic))
        .forEach((diagnostic) => console.debug('[ai-workspace] 事件已安全忽略', diagnostic));
    }

    /** 安排使用最新 lastSequence 的下一次 SSE 连接。 */
    function scheduleReconnect(): void {
      if (disposed || terminal || reconnectTimer) return;

      retryAttempt += 1;
      const delay = Math.min(5000, 500 * 2 ** Math.min(retryAttempt - 1, 3));
      setStreamState('RECONNECTING');
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, delay);
    }

    /** 关闭当前订阅并按已确认序号创建新的 EventSource。 */
    function connect(): void {
      if (disposed || terminal) return;

      const current = ensureRunEventState();
      setStreamState(retryAttempt > 0 ? 'RECONNECTING' : 'CONNECTING');
      subscription?.close();
      subscription = subscribeToAiRunStream({
        threadId: currentThreadId,
        runId,
        afterSequence: current.lastSequence,
        onOpen: () => {
          if (disposed) return;
          retryAttempt = 0;
          setStreamState('CONNECTED');
          setStreamError(null);
        },
        onEvent: (event) => {
          if (disposed) return;
          updateRunEventState((state) => {
            const previous = state ?? createAiEventReducerState(runId, { status: activeRunSnapshot.status });
            const next = reduceAiEvent(previous, event);
            logNewDiagnostics(previous, next);
            return next;
          });
        },
        onStatus: (snapshot) => {
          if (disposed || !isAiRunStreamStatus(snapshot)) return;
          markThreadRunStatus(currentThreadId, snapshot.runId, snapshot.status);
          updateRunEventState((state) => {
            const current = state ?? createAiEventReducerState(runId, { status: activeRunSnapshot.status });
            return applyAiRunSnapshot(current, snapshot);
          });
          if (isAiRunTerminal(snapshot.status)) {
            terminal = true;
            subscription?.close();
            subscription = null;
            setStreamState('IDLE');
            void refreshCurrentThread();
          }
        },
        onStreamError: (error) => {
          if (disposed) return;
          streamFailed = true;
          setStreamError(error.message);
          setStreamState('ERROR');
          subscription?.close();
          subscription = null;
        },
        onError: () => {
          if (disposed || terminal || streamFailed) return;
          subscription?.close();
          subscription = null;
          scheduleReconnect();
        },
      });
    }

    connect();

    return () => {
      disposed = true;
      terminal = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      subscription?.close();
      subscription = null;
    };
  }, [
    postStreamRunId,
    refreshCurrentThread,
    markThreadRunStatus,
    setStreamError,
    setStreamState,
    threadId,
    threadState.activeRun,
    threadState.thread?.id,
    updateRunEventState,
  ]);

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
    threadState,
    threadLoadState,
    threadError,
    messageLoadState,
    messageError,
    runEventState,
    streamState,
    streamError,
    ...commands,
    queuedMessages: useMemo(
      () => toAiWorkspaceQueuedMessages(threadState.messages, localQueuedMessages, steeringRunId),
      [localQueuedMessages, steeringRunId, threadState.messages],
    ),
    activeRunStatus: runEventState?.status ?? threadState.activeRun?.status ?? null,
    selectThread,
    startNewThread,
    loadMoreMessages,
  };
}

/** 从未知异常中提取可安全展示的错误文案。 */
function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** 校验 SSE 状态快照的最小结构，避免不可信事件覆盖当前 Run 状态。 */
function isAiRunStreamStatus(value: unknown): value is AiRunStreamStatus {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.runId === 'string' &&
    typeof candidate.threadId === 'string' &&
    typeof candidate.status === 'string' &&
    (AI_RUN_STATUSES as readonly string[]).includes(candidate.status) &&
    isNullableString(candidate.cancellationReason) &&
    isNullableString(candidate.failureReason) &&
    isNullableString(candidate.failureCode) &&
    typeof candidate.lastSequence === 'number' &&
    Number.isSafeInteger(candidate.lastSequence) &&
    candidate.lastSequence >= 0
  );
}

/** 校验 SSE 状态快照中允许为空的字符串字段。 */
function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}
