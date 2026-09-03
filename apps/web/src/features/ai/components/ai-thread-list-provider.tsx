/**
 * 本文件维护 AI 工作区侧栏的固定会话和最近会话列表。
 *
 * Provider 挂在 AI 一级路由布局中，使会话列表跨 `/ai` 与 `/ai/:threadId`
 * 的页面切换复用同一份客户端状态，避免点击历史会话时重复请求侧栏数据。
 */
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AiThreadListItem } from '@workspace/contracts/ai';

import { getAiPinnedThreads, getAiThreadPage } from '../services/ai-thread-client.service';
import type { AiWorkspaceLoadState } from '../types/ai-workspace';

/** AI 侧栏活动列表的可恢复快照，用于元数据请求失败时回滚。 */
export type AiThreadListSnapshot = Readonly<{
  /** 当前用户固定的会话列表。 */
  pinnedThreads: AiThreadListItem[];
  /** 当前用户未归档的最近会话列表。 */
  recentThreads: AiThreadListItem[];
}>;

/** AI 侧栏列表 Provider 对外暴露的状态、刷新和局部更新能力。 */
type AiThreadListContextValue = {
  /** 当前用户固定的会话列表。 */
  pinnedThreads: AiThreadListItem[];
  /** 当前用户未归档的最近会话列表。 */
  recentThreads: AiThreadListItem[];
  /** 固定和最近列表的加载状态。 */
  listState: AiWorkspaceLoadState;
  /** 固定和最近列表的加载错误。 */
  listError: string | null;
  /** 在创建新会话或需要重新读取列表时刷新侧栏列表。 */
  refreshThreadLists: (signal?: AbortSignal) => Promise<void>;
  /** 将服务端确认或乐观构造的 Thread 元数据同步到活动列表。 */
  applyThreadListItem: (thread: AiThreadListItem) => void;
  /** 恢复元数据请求前的活动列表快照。 */
  restoreThreadListSnapshot: (snapshot: AiThreadListSnapshot) => void;
};

/** AI 侧栏列表上下文；必须由 `(ai)` 稳定布局中的 Provider 提供。 */
const AiThreadListContext = createContext<AiThreadListContextValue | null>(null);

/** 按固定时间倒序排列固定会话，保持与服务端列表顺序一致。 */
function sortPinnedThreads(threads: AiThreadListItem[]): AiThreadListItem[] {
  return [...threads].sort((left, right) => {
    const pinnedAtOrder = (right.pinnedAt ?? '').localeCompare(left.pinnedAt ?? '');
    return pinnedAtOrder !== 0 ? pinnedAtOrder : right.id.localeCompare(left.id);
  });
}

/** 按最后活动时间倒序排列最近会话，保持与服务端游标首页顺序一致。 */
function sortRecentThreads(threads: AiThreadListItem[]): AiThreadListItem[] {
  return [...threads].sort((left, right) => {
    const updatedAtOrder = right.updatedAt.localeCompare(left.updatedAt);
    return updatedAtOrder !== 0 ? updatedAtOrder : right.id.localeCompare(left.id);
  });
}

/** 将一个 Thread 按当前归档和固定状态放回两个活动列表。 */
function reconcileThreadListItem(
  threads: AiThreadListItem[],
  thread: AiThreadListItem,
  list: 'PINNED' | 'RECENT',
): AiThreadListItem[] {
  const withoutThread = threads.filter((item) => item.id !== thread.id);
  if (thread.archivedAt !== null) return withoutThread;

  if (list === 'PINNED') {
    return thread.pinnedAt === null ? withoutThread : sortPinnedThreads([...withoutThread, thread]);
  }

  return thread.pinnedAt === null ? sortRecentThreads([...withoutThread, thread]) : withoutThread;
}

/** 渲染跨 AI 页面路由复用的侧栏列表状态。 */
export function AiThreadListProvider({ children }: { children: ReactNode }) {
  const [pinnedThreads, setPinnedThreads] = useState<AiThreadListItem[]>([]);
  const [recentThreads, setRecentThreads] = useState<AiThreadListItem[]>([]);
  const [listState, setListState] = useState<AiWorkspaceLoadState>('LOADING');
  const [listError, setListError] = useState<string | null>(null);

  /** 读取固定和最近会话，并允许路由布局卸载时取消请求。 */
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
      if (requestSignal.aborted) return;
      setPinnedThreads(pinnedPage.items);
      setRecentThreads(recentPage.items);
      setListState('SUCCESS');
    } catch (error: unknown) {
      if (requestSignal.aborted) return;
      setListState('ERROR');
      setListError(error instanceof Error && error.message ? error.message : 'AI 会话列表加载失败，请稍后重试');
    }
  }, []);

  /** 按 Thread 当前元数据把条目局部同步到固定或最近列表，不重新请求列表。 */
  const applyThreadListItem = useCallback((thread: AiThreadListItem) => {
    setPinnedThreads((current) => reconcileThreadListItem(current, thread, 'PINNED'));
    setRecentThreads((current) => reconcileThreadListItem(current, thread, 'RECENT'));
  }, []);

  /** 恢复元数据变更开始前的固定和最近列表。 */
  const restoreThreadListSnapshot = useCallback((snapshot: AiThreadListSnapshot) => {
    setPinnedThreads(snapshot.pinnedThreads);
    setRecentThreads(snapshot.recentThreads);
  }, []);

  /** 只在 AI 一级布局首次挂载时加载侧栏列表，路由切换不会重复触发。 */
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void refreshThreadLists(controller.signal));

    return () => controller.abort();
  }, [refreshThreadLists]);

  const value = useMemo(
    () => ({
      pinnedThreads,
      recentThreads,
      listState,
      listError,
      refreshThreadLists,
      applyThreadListItem,
      restoreThreadListSnapshot,
    }),
    [
      applyThreadListItem,
      listError,
      listState,
      pinnedThreads,
      recentThreads,
      refreshThreadLists,
      restoreThreadListSnapshot,
    ],
  );

  return <AiThreadListContext.Provider value={value}>{children}</AiThreadListContext.Provider>;
}

/** 读取 AI 工作区跨路由复用的侧栏列表状态。 */
export function useAiThreadLists(): AiThreadListContextValue {
  const context = useContext(AiThreadListContext);

  if (!context) {
    throw new Error('AiThreadListProvider 未挂载，无法读取 AI 会话列表');
  }

  return context;
}
