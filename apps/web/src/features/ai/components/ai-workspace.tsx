/**
 * 本文件协调 AI Thread 历史、深链接恢复、管理操作和当前聊天工作区。
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { AiThreadArchiveState, AiThreadListItem } from '@workspace/contracts/ai';
import { toast } from '@workspace/ui/components/sonner';

import {
  getAiThreadSnapshot,
  listAiThreadHistory,
  updateAiThread,
  type AiThreadSnapshot,
} from '../services/ai-thread.service';
import { AI_THREAD_MESSAGE_PAGE_SIZE, useAiThreadContent } from '../hooks/use-ai-thread-content';
import type { AiDecisionUiMessage } from '../types/ai-message';
import type { AiRunLocatedMetadata, AiRunRequestContext } from '../utils/ai-chat-session';
import { toAiDecisionUiMessages } from '../utils/ai-thread-timeline';
import {
  canApplyAiRunSettlementSnapshot,
  isCurrentAiWorkspaceRun,
  mergeAiThreadListItems,
  runSerialAiActiveRunPoll,
  toAiThreadListItem,
  toAiWorkspaceErrorMessage,
  waitForAiAuthoritativeState,
} from '../utils/ai-workspace-state';
import { AiChatPanel } from './ai-chat-panel';
import { AiThreadLoadState } from './ai-thread-load-state';
import { AiWorkspaceNavigation } from './ai-workspace-navigation';

/** 第一版历史导航单页数量。 */
const AI_THREAD_PAGE_SIZE = 20;
/** 活跃 Run 的权威状态轮询间隔。 */
const AI_ACTIVE_RUN_REFRESH_INTERVAL_MS = 1_000;

/** AI 工作区入口属性。 */
export type AiWorkspaceProps = {
  /** 深链接中需要恢复的 Thread；新会话为空。 */
  initialThreadId: string | null;
};

/** 渲染桌面双栏与移动历史抽屉，并维持 Thread 级状态隔离。 */
export function AiWorkspace({ initialThreadId }: AiWorkspaceProps) {
  const router = useRouter();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(initialThreadId);
  const selectedThreadIdRef = useRef<string | null>(initialThreadId);
  const [sessionId, setSessionId] = useState(initialThreadId ? `thread-${initialThreadId}` : 'draft-0');
  const sessionIdRef = useRef(sessionId);
  const [archiveState, setArchiveState] = useState<AiThreadArchiveState>('active');
  const [threads, setThreads] = useState<AiThreadListItem[]>([]);
  const [threadListLoading, setThreadListLoading] = useState(true);
  const [threadListError, setThreadListError] = useState<string | null>(null);
  const [threadListCursor, setThreadListCursor] = useState<string | null>(null);
  const [threadListHasMore, setThreadListHasMore] = useState(false);
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);
  const [historySheetOpen, setHistorySheetOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const disconnectRef = useRef<(() => Promise<void>) | null>(null);
  const listRequestSequence = useRef(0);

  /** 撤下已经锁定的历史项，并让失效前发出的列表请求不再回填旧标题。 */
  const hideScopeChangedThread = useCallback((threadId: string): void => {
    listRequestSequence.current += 1;
    setThreads((current) => current.filter((item) => item.id !== threadId));
    setThreadListLoading(false);
  }, []);

  const {
    thread,
    historyItems,
    historyLoading,
    historyError,
    hasOlderMessages,
    scopeChanged,
    applyThreadSnapshot,
    canApplyThreadResult,
    getThreadScopeVersion,
    invalidateThreadScope,
    loadOlderMessages,
    reloadThread,
    resetThreadContent,
    setThreadDetail,
    showThreadError,
  } = useAiThreadContent({
    initialLoading: Boolean(initialThreadId),
    selectedThreadIdRef,
    disconnectRef,
    onScopeChanged: hideScopeChangedThread,
  });

  /** 读取当前归档筛选的 Thread 首屏或下一页。 */
  const loadThreadList = useCallback(
    async (targetArchiveState: AiThreadArchiveState, append: boolean, cursor: string | null = null): Promise<void> => {
      const requestSequence = ++listRequestSequence.current;
      setThreadListLoading(true);
      setThreadListError(null);

      try {
        const page = await listAiThreadHistory({
          archiveState: targetArchiveState,
          cursor: append ? (cursor ?? undefined) : undefined,
          limit: AI_THREAD_PAGE_SIZE,
        });
        if (requestSequence !== listRequestSequence.current) {
          return;
        }

        setThreads((current) => (append ? mergeAiThreadListItems(current, page.items) : page.items));
        setThreadListCursor(page.nextCursor);
        setThreadListHasMore(page.hasMore);
      } catch (error) {
        if (requestSequence === listRequestSequence.current) {
          setThreadListError(toAiWorkspaceErrorMessage(error, 'AI 会话历史加载失败，请稍后重试'));
        }
      } finally {
        if (requestSequence === listRequestSequence.current) {
          setThreadListLoading(false);
        }
      }
    },
    [],
  );

  /** 切换历史归档范围，并在事件阶段立即重置旧筛选分页。 */
  const changeArchiveState = useCallback((state: AiThreadArchiveState): void => {
    setArchiveState(state);
    setThreads([]);
    setThreadListCursor(null);
    setThreadListHasMore(false);
    setThreadListError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        void loadThreadList(archiveState, false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [archiveState, loadThreadList]);

  useEffect(() => {
    if (!selectedThreadId) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        void reloadThread(selectedThreadId);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [reloadThread, selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId || !thread?.activeRunId || thread.latestRun?.status === 'QUEUED') {
      return;
    }

    let cancelled = false;
    const pollingScopeVersion = getThreadScopeVersion();
    void runSerialAiActiveRunPoll({
      shouldContinue: () => !cancelled && canApplyThreadResult(selectedThreadId, pollingScopeVersion),
      wait: () => waitForAiAuthoritativeState(AI_ACTIVE_RUN_REFRESH_INTERVAL_MS),
      refresh: async () => {
        await reloadThread(selectedThreadId, true, true);
      },
    });

    return () => {
      cancelled = true;
    };
  }, [
    canApplyThreadResult,
    getThreadScopeVersion,
    reloadThread,
    selectedThreadId,
    thread?.activeRunId,
    thread?.latestRun?.status,
  ]);

  /** 只断开浏览器当前流，不把显式 Thread 切换解释成取消 Run。 */
  const disconnectCurrentStream = useCallback(async (): Promise<void> => {
    await disconnectRef.current?.();
    disconnectRef.current = null;
  }, []);

  /** 同步更新渲染状态与异步回调使用的会话代次。 */
  const replaceSessionId = useCallback((nextSessionId: string): void => {
    sessionIdRef.current = nextSessionId;
    setSessionId(nextSessionId);
  }, []);

  /** 切换到另一个 Thread，并清空前一会话的局部输入和实时状态。 */
  const selectThread = useCallback(
    (threadId: string): void => {
      if (threadId === selectedThreadIdRef.current) {
        setHistorySheetOpen(false);
        return;
      }

      void disconnectCurrentStream();
      selectedThreadIdRef.current = threadId;
      setSelectedThreadId(threadId);
      resetThreadContent(true);
      replaceSessionId(`thread-${threadId}-${Date.now()}`);
      setHistorySheetOpen(false);
      router.push(`/ai/${encodeURIComponent(threadId)}`, { scroll: false });
    },
    [disconnectCurrentStream, replaceSessionId, resetThreadContent, router],
  );

  /** 创建仅存在于前端的新草稿，不提前持久化空 Thread。 */
  const createDraft = useCallback((): void => {
    void disconnectCurrentStream();
    selectedThreadIdRef.current = null;
    setSelectedThreadId(null);
    resetThreadContent(false);
    replaceSessionId(`draft-${Date.now()}`);
    setHistorySheetOpen(false);
    if (archiveState !== 'active') {
      changeArchiveState('active');
    }
    router.push('/ai', { scroll: false });
  }, [archiveState, changeArchiveState, disconnectCurrentStream, replaceSessionId, resetThreadContent, router]);

  /** 首个 Run 元数据到达后用原生 History API 更新深链接，避免中断当前流。 */
  const handleRunLocated = useCallback(
    ({ sessionId: locatedSessionId, threadId }: AiRunLocatedMetadata): void => {
      if (
        locatedSessionId !== sessionIdRef.current ||
        (selectedThreadIdRef.current !== null && selectedThreadIdRef.current !== threadId)
      ) {
        return;
      }

      selectedThreadIdRef.current = threadId;
      setSelectedThreadId(threadId);
      window.history.replaceState(window.history.state, '', `/ai/${encodeURIComponent(threadId)}`);
      void reloadThread(threadId, true);
      void loadThreadList(archiveState, false);
    },
    [archiveState, loadThreadList, reloadThread],
  );

  /** 只为发起回调的同一 Run 短轮询权威终态，旧会话结果返回空应用信号。 */
  const handleRunSettled = useCallback(
    async (context: AiRunRequestContext): Promise<AiDecisionUiMessage[] | null> => {
      const requestScopeVersion = getThreadScopeVersion();
      if (
        !isCurrentAiWorkspaceRun(context, sessionIdRef.current, selectedThreadIdRef.current) ||
        !canApplyThreadResult(context.threadId, requestScopeVersion)
      ) {
        return null;
      }

      for (let attempt = 0; attempt < 6; attempt += 1) {
        let snapshot: AiThreadSnapshot;
        try {
          snapshot = await getAiThreadSnapshot(context.threadId, AI_THREAD_MESSAGE_PAGE_SIZE);
        } catch (error) {
          if (invalidateThreadScope(context.threadId, error)) {
            return null;
          }
          if (
            isCurrentAiWorkspaceRun(context, sessionIdRef.current, selectedThreadIdRef.current) &&
            canApplyThreadResult(context.threadId, requestScopeVersion)
          ) {
            showThreadError(toAiWorkspaceErrorMessage(error, 'AI 运行状态刷新失败，请稍后重试'));
          }
          return null;
        }

        if (
          !canApplyAiRunSettlementSnapshot(
            context,
            sessionIdRef.current,
            selectedThreadIdRef.current,
            snapshot.detail.activeRunId,
          ) ||
          !canApplyThreadResult(context.threadId, requestScopeVersion) ||
          !applyThreadSnapshot(context.threadId, snapshot, true, requestScopeVersion)
        ) {
          return null;
        }

        if (snapshot.detail.activeRunId === null) {
          await loadThreadList(archiveState, false);
          return toAiDecisionUiMessages(snapshot.items);
        }

        await waitForAiAuthoritativeState();
      }

      return null;
    },
    [
      applyThreadSnapshot,
      archiveState,
      canApplyThreadResult,
      getThreadScopeVersion,
      invalidateThreadScope,
      loadThreadList,
      showThreadError,
    ],
  );

  /** 重命名 Thread，并同步当前详情与历史列表。 */
  const renameThread = useCallback(
    async (threadId: string, title: string): Promise<boolean> => {
      setPendingThreadId(threadId);
      try {
        const response = await updateAiThread(threadId, { title });
        setThreads((current) =>
          current.map((item) => (item.id === threadId ? toAiThreadListItem(response.thread) : item)),
        );
        if (selectedThreadIdRef.current === threadId) {
          setThreadDetail(response.thread);
        }
        toast.success('会话标题已更新');
        return true;
      } catch (error) {
        invalidateThreadScope(threadId, error);
        toast.error(toAiWorkspaceErrorMessage(error, '会话标题更新失败'));
        return false;
      } finally {
        setPendingThreadId(null);
      }
    },
    [invalidateThreadScope, setThreadDetail],
  );

  /** 归档或恢复 Thread；归档当前会话后返回未保存的新草稿。 */
  const setThreadArchived = useCallback(
    async (threadId: string, archived: boolean): Promise<boolean> => {
      setPendingThreadId(threadId);
      try {
        const response = await updateAiThread(threadId, { archived });
        toast.success(archived ? '会话已归档' : '会话已恢复');
        const restoringSelectedThread = !archived && selectedThreadIdRef.current === threadId;

        if (selectedThreadIdRef.current === threadId) {
          if (archived) {
            await loadThreadList(archiveState, false);
            createDraft();
          } else {
            setThreadDetail(response.thread);
            if (archiveState === 'active') {
              await loadThreadList('active', false);
            } else {
              changeArchiveState('active');
            }
          }
        } else {
          await loadThreadList(archiveState, false);
        }

        if (restoringSelectedThread) setHistorySheetOpen(false);
        return true;
      } catch (error) {
        invalidateThreadScope(threadId, error);
        toast.error(toAiWorkspaceErrorMessage(error, archived ? '会话归档失败' : '会话恢复失败'));
        return false;
      } finally {
        setPendingThreadId(null);
      }
    },
    [archiveState, changeArchiveState, createDraft, invalidateThreadScope, loadThreadList, setThreadDetail],
  );

  /** 从聊天区恢复当前深链接指向的已归档 Thread。 */
  const restoreCurrentThread = useCallback(async (): Promise<boolean> => {
    const threadId = selectedThreadIdRef.current;
    return threadId ? setThreadArchived(threadId, false) : false;
  }, [setThreadArchived]);

  return (
    <div className="grid size-full min-h-0 min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm lg:grid-cols-[auto_minmax(0,1fr)]">
      <AiWorkspaceNavigation
        activeThreadId={selectedThreadId}
        archiveState={archiveState}
        threads={threads}
        loading={threadListLoading}
        error={threadListError}
        hasMore={threadListHasMore}
        pendingThreadId={pendingThreadId}
        sheetOpen={historySheetOpen}
        collapsed={sidebarCollapsed}
        onSheetOpenChange={setHistorySheetOpen}
        onCollapsedChange={setSidebarCollapsed}
        onArchiveStateChange={changeArchiveState}
        onCreate={createDraft}
        onSelect={selectThread}
        onRename={renameThread}
        onSetArchived={setThreadArchived}
        onReload={() => void loadThreadList(archiveState, false)}
        onLoadMore={() => void loadThreadList(archiveState, true, threadListCursor)}
      />

      {selectedThreadId && !thread && (sessionId.startsWith('thread-') || scopeChanged) ? (
        <AiThreadLoadState
          error={historyError}
          loading={historyLoading}
          onOpenHistory={() => setHistorySheetOpen(true)}
          onRetry={() => void reloadThread(selectedThreadId)}
        />
      ) : (
        <AiChatPanel
          key={sessionId}
          sessionId={sessionId}
          thread={thread}
          historyItems={historyItems}
          historyLoading={historyLoading}
          historyError={historyError}
          hasOlderMessages={hasOlderMessages}
          onOpenHistory={() => setHistorySheetOpen(true)}
          onRunLocated={handleRunLocated}
          onRunSettled={handleRunSettled}
          onLoadOlderMessages={() => void loadOlderMessages()}
          onReloadThread={() => {
            const threadId = selectedThreadIdRef.current;
            if (threadId) void reloadThread(threadId);
          }}
          onRestoreThread={restoreCurrentThread}
          disconnectRef={disconnectRef}
        />
      )}
    </div>
  );
}
