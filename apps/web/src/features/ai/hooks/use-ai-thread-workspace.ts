/**
 * 本文件维护 AI Thread 工作区的路由、持久化消息、命令和实时运行状态。
 *
 * 2.6-B 在同一入口补充已持久化 Run 的领域事件归约和 SSE 生命周期；
 * 2.6-C/D 的命令与元数据操作分别由同目录专用 Hook 维护。
 * 2.7-E 在已有 Thread 上补充 POST SSE 主流，并在 handoff 后复用 GET SSE 恢复。
 * 按计划这里仍是单一 Thread 状态入口：路由版本、历史消息和 SSE reducer
 * 共享同一个门禁，专用 Hook 通过该入口读写当前 Thread。
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import {
  AI_RUN_STATUSES,
  type AiThreadListItem,
} from '@workspace/contracts/ai';

import { subscribeToAiRunStream, type AiRunStreamStatus } from '../services/ai-thread-stream.service';
import {
  getAiMessagePage,
  getAiPinnedThreads,
  getAiThreadDetail,
  getAiThreadPage,
} from '../services/ai-thread-client.service';
import type {
  AiWorkspaceLoadState,
  AiWorkspaceQueuedMessage,
  AiWorkspaceStreamState,
  AiWorkspaceThreadPreview,
  AiWorkspaceThreadState,
} from '../types/ai-workspace';
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
 * 加载并管理当前 AI 工作区的 Thread、消息、Run 和会话命令资源。
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
  const [runEventState, setRunEventState] = useState<AiEventReducerState | null>(null);
  const runEventStateRef = useRef<AiEventReducerState | null>(null);
  const [streamState, setStreamState] = useState<AiWorkspaceStreamState>('IDLE');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [postStreamRunId, setPostStreamRunId] = useState<string | null>(null);
  const [localQueuedMessages, setLocalQueuedMessages] = useState<AiWorkspaceQueuedMessage[]>([]);
  const [steeringRunId, setSteeringRunId] = useState<string | null>(null);

  /** 更新 Run 事件状态并同步游标引用，供断线重连读取最新序号。 */
  const updateRunEventState = useCallback(
    (updater: (current: AiEventReducerState | null) => AiEventReducerState | null) => {
      setRunEventState((current) => {
        const next = updater(current);
        runEventStateRef.current = next;
        return next;
      });
    },
    [],
  );

  /** 重新读取当前 Thread 的详情和最新消息，让刷新结果成为命令后的权威状态。 */
  const refreshCurrentThread = useCallback(async () => {
    if (!threadId) return;

    const requestVersion = requestVersionRef.current;

    try {
      const [detail, page] = await Promise.all([
        getAiThreadDetail(threadId),
        getAiMessagePage(threadId),
      ]);
      if (requestVersion !== requestVersionRef.current) return;

      const nextRunEventState = detail.activeRun
        ? createAiEventReducerState(detail.activeRun.runId, { status: detail.activeRun.status })
        : null;
      runEventStateRef.current = nextRunEventState;
      setRunEventState(nextRunEventState);
      setThreadState({
        thread: detail,
        activeRun: detail.activeRun,
        messages: page.items,
        messageCursor: page.nextCursor,
        hasMoreMessages: page.hasMore,
      });
      setThreadLoadState('SUCCESS');
      setMessageLoadState('SUCCESS');
      setMessageError(null);
      setLocalQueuedMessages([]);
      setSteeringRunId(null);
    } catch (error: unknown) {
      if (requestVersion !== requestVersionRef.current) return;
      setThreadError(toErrorMessage(error, 'AI 会话刷新失败，请稍后重试'));
    }
  }, [threadId]);

  /** 重新读取固定与最近会话列表，保证新建 Thread 能及时出现在侧栏。 */
  const refreshThreadLists = useCallback(async (signal?: AbortSignal) => {
    const controller = new AbortController();
    const requestSignal = signal ?? controller.signal;
    setListState('LOADING');
    setListError(null);

    try {
      const [pinnedPage, recentPage] = await Promise.all([
        getAiPinnedThreads(requestSignal),
        getAiThreadPage({}, requestSignal),
      ]);
      setPinnedThreads(pinnedPage.items);
      setRecentThreads(recentPage.items);
      setListState('SUCCESS');
    } catch (error: unknown) {
      if (requestSignal.aborted) return;
      setListState('ERROR');
      setListError(toErrorMessage(error, 'AI 会话列表加载失败，请稍后重试'));
    }
  }, []);

  const metadata = useAiThreadMetadata({
    threadId,
    setThreadState,
    refreshThreadLists,
  });

  /** 跳转到 URL 唯一标识的目标会话，不在本地保存当前会话副本。 */
  const selectThread = useCallback(
    (nextThreadId: string) => {
      router.push(`/ai/${encodeURIComponent(nextThreadId)}`);
    },
    [router],
  );

  /** 返回无 Thread 标识的新会话工作区；首条消息由命令入口创建 Thread。 */
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
    queueMicrotask(() => void refreshThreadLists(controller.signal));

    return () => controller.abort();
  }, [refreshThreadLists]);

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
      runEventStateRef.current = null;
      setRunEventState(null);
      setStreamState('IDLE');
      setStreamError(null);
      setPostStreamRunId(null);
      setLocalQueuedMessages([]);
      setSteeringRunId(null);
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
        const currentRunEventState = runEventStateRef.current;
        const preservesPostStream =
          currentRunEventState !== null &&
          (!detail.activeRun || detail.activeRun.runId === currentRunEventState.runId);
        const nextRunEventState = preservesPostStream
          ? currentRunEventState
          : detail.activeRun
            ? createAiEventReducerState(detail.activeRun.runId, { status: detail.activeRun.status })
            : null;
        runEventStateRef.current = nextRunEventState;
        setRunEventState(nextRunEventState);
        setThreadState((current) => {
          const activeRun = preservesPostStream ? current.activeRun : detail.activeRun;
          const thread = preservesPostStream && currentRunEventState
            ? { ...detail, activeRunId: currentRunEventState.runId }
            : detail;
          return { ...current, thread, activeRun };
        });
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

  /** 将发送、停止和重试命令接入当前 Thread 的统一状态入口。 */
  const commands = useAiThreadCommands({
    threadId,
    threadState,
    setThreadState,
    runEventStateRef,
    requestVersionRef,
    updateRunEventState,
    refreshCurrentThread,
    refreshThreadLists,
    setLocalQueuedMessages,
    setPostStreamRunId,
    setStreamError,
    setStreamState,
    setSteeringRunId,
  });

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
      const current = runEventStateRef.current;
      if (current?.runId === runId) {
        return current;
      }

      const next = createAiEventReducerState(runId, { status: activeRunSnapshot.status });
      runEventStateRef.current = next;
      setRunEventState(next);
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
  }, [postStreamRunId, refreshCurrentThread, threadId, threadState.activeRun, threadState.thread?.id, updateRunEventState]);

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
