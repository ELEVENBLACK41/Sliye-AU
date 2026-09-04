/**
 * 本文件维护 AI Thread 的会话元数据操作和归档列表。
 * 元数据变更先局部乐观更新侧栏，失败时恢复变更前快照，不修改消息、SSE 或 Run 状态机。
 */
'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { AiThreadListItem } from '@workspace/contracts/ai';

import { ApiClientError } from '@/services/request';

import { useAiThreadLists } from '../components/ai-thread-list-provider';
import {
  getAiThreadPage,
  renameAiThread,
  setAiThreadArchived,
  setAiThreadPinned,
} from '../services/ai-thread-client.service';
import { useAiThreadWorkspaceStore } from '../store/ai-thread-workspace.store';
import type { AiWorkspaceLoadState, AiWorkspaceThreadPreview } from '../types/ai-workspace';

/** 将服务端列表项转换为侧栏使用的 URL 选中态模型。 */
function toThreadPreview(item: AiThreadListItem, threadId: string | undefined): AiWorkspaceThreadPreview {
  return { ...item, isActive: item.id === threadId };
}

/** 按服务端的最后活动时间顺序排列已归档会话。 */
function sortArchivedThreads(threads: AiThreadListItem[]): AiThreadListItem[] {
  return [...threads].sort((left, right) => {
    const updatedAtOrder = right.updatedAt.localeCompare(left.updatedAt);
    return updatedAtOrder !== 0 ? updatedAtOrder : right.id.localeCompare(left.id);
  });
}

/** 从活动或已归档列表中找到待修改的 Thread，作为乐观更新的基线。 */
function findThreadListItem(
  threadId: string,
  pinnedThreads: AiThreadListItem[],
  recentThreads: AiThreadListItem[],
  archivedThreads: AiThreadListItem[],
): AiThreadListItem | null {
  return [...pinnedThreads, ...recentThreads, ...archivedThreads].find((thread) => thread.id === threadId) ?? null;
}

/** 将会话元数据接口的稳定错误码转换为用户可执行的中文反馈。 */
function toMetadataErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiClientError)) return error instanceof Error && error.message ? error.message : fallback;

  switch (error.code) {
    case API_ERROR_CODES.AI_THREAD_PINNED_LIMIT_EXCEEDED:
      return '已达到会话置顶上限，请先取消一个置顶会话后再试';
    case API_ERROR_CODES.AI_THREAD_RUN_ACTIVE:
      return '当前会话仍有正在处理的回答，请先停止后再归档';
    case API_ERROR_CODES.AI_THREAD_ARCHIVED:
      return '该会话已归档，请先恢复后再继续操作';
    case API_ERROR_CODES.AI_THREAD_NOT_FOUND:
      return 'AI 会话不存在或无权访问';
    default:
      return error.message || fallback;
  }
}

/** 管理固定列表、归档列表和会话元数据写操作。 */
export function useAiThreadMetadata(threadId: string | undefined) {
  const { pinnedThreads, recentThreads, applyThreadListItem, restoreThreadListSnapshot } = useAiThreadLists();
  const updateThreadState = useAiThreadWorkspaceStore((state) => state.updateThreadState);
  const [archivedThreads, setArchivedThreads] = useState<AiThreadListItem[]>([]);
  const [archivedListState, setArchivedListState] = useState<AiWorkspaceLoadState>('IDLE');
  const [archivedListError, setArchivedListError] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataPendingThreadId, setMetadataPendingThreadId] = useState<string | null>(null);
  const metadataPendingThreadIdRef = useRef<string | null>(null);
  const archivedRequestControllerRef = useRef<AbortController | null>(null);

  /** 将服务端确认或乐观构造的 Thread 元数据同步到已归档列表。 */
  const applyArchivedThreadItem = useCallback((thread: AiThreadListItem) => {
    setArchivedThreads((current) => {
      const withoutThread = current.filter((item) => item.id !== thread.id);
      return thread.archivedAt === null ? withoutThread : sortArchivedThreads([...withoutThread, thread]);
    });
  }, []);

  /** 按需读取已归档会话，避免首屏为不常用的侧栏视图额外请求数据。 */
  const loadArchivedThreads = useCallback(async () => {
    if (archivedListState === 'LOADING') return;

    archivedRequestControllerRef.current?.abort();
    const controller = new AbortController();
    archivedRequestControllerRef.current = controller;
    setArchivedListState('LOADING');
    setArchivedListError(null);

    try {
      const page = await getAiThreadPage({ filter: 'ARCHIVED' }, controller.signal);
      if (controller.signal.aborted) return;
      setArchivedThreads(page.items);
      setArchivedListState('SUCCESS');
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      setArchivedListState('ERROR');
      setArchivedListError(toMetadataErrorMessage(error, '已归档会话加载失败，请稍后重试'));
    } finally {
      if (archivedRequestControllerRef.current === controller) archivedRequestControllerRef.current = null;
    }
  }, [archivedListState]);

  /** 将服务端确认的 Thread 元数据更新到当前详情，不修改消息或 Run reducer。 */
  const applyThreadMetadata = useCallback(
    (thread: AiThreadListItem) => {
      updateThreadState((current) => {
        if (current.thread?.id !== thread.id) return current;

        return {
          ...current,
          thread,
          activeRun: thread.activeRunId === null ? null : current.activeRun,
        };
      });
    },
    [updateThreadState],
  );

  /** 执行一次元数据变更，统一处理乐观更新、失败回滚和服务端确认。 */
  const runMetadataMutation = useCallback(
    async (
      mutationThreadId: string,
      optimisticThread: AiThreadListItem | null,
      operation: () => Promise<AiThreadListItem>,
      fallbackMessage: string,
    ): Promise<boolean> => {
      if (metadataPendingThreadIdRef.current) return false;

      const previousListSnapshot = { pinnedThreads, recentThreads };
      const previousArchivedThreads = archivedThreads;
      metadataPendingThreadIdRef.current = mutationThreadId;
      setMetadataPendingThreadId(mutationThreadId);
      setMetadataError(null);

      if (optimisticThread) {
        applyThreadListItem(optimisticThread);
        applyArchivedThreadItem(optimisticThread);
      }

      try {
        const thread = await operation();
        applyThreadListItem(thread);
        applyArchivedThreadItem(thread);
        applyThreadMetadata(thread);
        return true;
      } catch (error: unknown) {
        restoreThreadListSnapshot(previousListSnapshot);
        setArchivedThreads(previousArchivedThreads);
        setMetadataError(toMetadataErrorMessage(error, fallbackMessage));
        return false;
      } finally {
        metadataPendingThreadIdRef.current = null;
        setMetadataPendingThreadId(null);
      }
    },
    [
      applyArchivedThreadItem,
      applyThreadListItem,
      applyThreadMetadata,
      archivedThreads,
      pinnedThreads,
      recentThreads,
      restoreThreadListSnapshot,
    ],
  );

  /** 置顶或取消置顶会话；先局部移动侧栏分组，失败时恢复原位置。 */
  const setThreadPinned = useCallback(
    (mutationThreadId: string, pinned: boolean) => {
      const currentThread = findThreadListItem(mutationThreadId, pinnedThreads, recentThreads, archivedThreads);

      return runMetadataMutation(
        mutationThreadId,
        currentThread ? { ...currentThread, pinnedAt: pinned ? new Date().toISOString() : null } : null,
        () => setAiThreadPinned(mutationThreadId, pinned),
        '会话固定状态更新失败，请稍后重试',
      );
    },
    [archivedThreads, pinnedThreads, recentThreads, runMetadataMutation],
  );

  /** 重命名会话；先更新侧栏标题，失败时恢复原标题。 */
  const renameThread = useCallback(
    (mutationThreadId: string, title: string) => {
      const currentThread = findThreadListItem(mutationThreadId, pinnedThreads, recentThreads, archivedThreads);

      return runMetadataMutation(
        mutationThreadId,
        currentThread ? { ...currentThread, title } : null,
        () => renameAiThread(mutationThreadId, title),
        '会话重命名失败，请稍后重试',
      );
    },
    [archivedThreads, pinnedThreads, recentThreads, runMetadataMutation],
  );

  /** 归档或恢复会话；先调整侧栏所属分组，失败时恢复原分组。 */
  const setThreadArchived = useCallback(
    (mutationThreadId: string, archived: boolean) => {
      const currentThread = findThreadListItem(mutationThreadId, pinnedThreads, recentThreads, archivedThreads);

      return runMetadataMutation(
        mutationThreadId,
        currentThread
          ? {
              ...currentThread,
              archivedAt: archived ? new Date().toISOString() : null,
              pinnedAt: null,
            }
          : null,
        () => setAiThreadArchived(mutationThreadId, archived),
        '会话归档状态更新失败，请稍后重试',
      );
    },
    [archivedThreads, pinnedThreads, recentThreads, runMetadataMutation],
  );

  return {
    archivedThreads: useMemo(
      () => archivedThreads.map((thread) => toThreadPreview(thread, threadId)),
      [archivedThreads, threadId],
    ),
    archivedListState,
    archivedListError,
    metadataError,
    metadataPendingThreadId,
    loadArchivedThreads,
    setThreadPinned,
    renameThread,
    setThreadArchived,
  };
}
