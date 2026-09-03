/**
 * 本文件维护 AI Thread 的会话元数据操作和归档列表。
 * 元数据变更只在服务端成功后刷新列表，不修改消息、SSE 或 Run 状态机。
 */
'use client';

import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { AiThreadListItem } from '@workspace/contracts/ai';

import { ApiClientError } from '@/services/request';

import {
  getAiThreadPage,
  renameAiThread,
  setAiThreadArchived,
  setAiThreadPinned,
} from '../services/ai-thread-client.service';
import type {
  AiWorkspaceLoadState,
  AiWorkspaceThreadPreview,
  AiWorkspaceThreadState,
} from '../types/ai-workspace';

/** 元数据 Hook 所需的工作区状态写入能力。 */
type AiThreadMetadataOptions = {
  /** 当前 URL 指向的 Thread 标识，用于计算归档列表选中态。 */
  threadId: string | undefined;
  /** 当前 Thread 状态的 React 写入器。 */
  setThreadState: Dispatch<SetStateAction<AiWorkspaceThreadState>>;
  /** 刷新活动侧栏列表的函数。 */
  refreshThreadLists: (signal?: AbortSignal) => Promise<void>;
};

/** 将服务端列表项转换为侧栏使用的 URL 选中态模型。 */
function toThreadPreview(item: AiThreadListItem, threadId: string | undefined): AiWorkspaceThreadPreview {
  return { ...item, isActive: item.id === threadId };
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
export function useAiThreadMetadata({
  threadId,
  setThreadState,
  refreshThreadLists,
}: AiThreadMetadataOptions) {
  const [archivedThreads, setArchivedThreads] = useState<AiThreadListItem[]>([]);
  const [archivedListState, setArchivedListState] = useState<AiWorkspaceLoadState>('IDLE');
  const [archivedListError, setArchivedListError] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataPendingThreadId, setMetadataPendingThreadId] = useState<string | null>(null);
  const metadataPendingThreadIdRef = useRef<string | null>(null);
  const archivedRequestControllerRef = useRef<AbortController | null>(null);

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
      setThreadState((current) => {
        if (current.thread?.id !== thread.id) return current;

        return {
          ...current,
          thread,
          activeRun: thread.activeRunId === null ? null : current.activeRun,
        };
      });
    },
    [setThreadState],
  );

  /** 执行一次元数据变更，统一处理重复点击、服务端错误码和变更后刷新。 */
  const runMetadataMutation = useCallback(
    async (
      mutationThreadId: string,
      operation: () => Promise<AiThreadListItem>,
      fallbackMessage: string,
    ): Promise<boolean> => {
      if (metadataPendingThreadIdRef.current) return false;

      metadataPendingThreadIdRef.current = mutationThreadId;
      setMetadataPendingThreadId(mutationThreadId);
      setMetadataError(null);

      try {
        const thread = await operation();
        applyThreadMetadata(thread);
        await refreshThreadLists();
        if (archivedListState !== 'IDLE') await loadArchivedThreads();
        return true;
      } catch (error: unknown) {
        setMetadataError(toMetadataErrorMessage(error, fallbackMessage));
        return false;
      } finally {
        metadataPendingThreadIdRef.current = null;
        setMetadataPendingThreadId(null);
      }
    },
    [applyThreadMetadata, archivedListState, loadArchivedThreads, refreshThreadLists],
  );

  /** 置顶或取消置顶会话；只有服务端成功后才刷新侧栏分组。 */
  const setThreadPinned = useCallback(
    (mutationThreadId: string, pinned: boolean) =>
      runMetadataMutation(
        mutationThreadId,
        () => setAiThreadPinned(mutationThreadId, pinned),
        '会话固定状态更新失败，请稍后重试',
      ),
    [runMetadataMutation],
  );

  /** 重命名会话；输入框提交失败时保持弹窗打开并展示稳定错误。 */
  const renameThread = useCallback(
    (mutationThreadId: string, title: string) =>
      runMetadataMutation(
        mutationThreadId,
        () => renameAiThread(mutationThreadId, title),
        '会话重命名失败，请稍后重试',
      ),
    [runMetadataMutation],
  );

  /** 归档或恢复会话；归档活跃 Run 时保留服务端拒绝，不提前移除侧栏项。 */
  const setThreadArchived = useCallback(
    (mutationThreadId: string, archived: boolean) =>
      runMetadataMutation(
        mutationThreadId,
        () => setAiThreadArchived(mutationThreadId, archived),
        '会话归档状态更新失败，请稍后重试',
      ),
    [runMetadataMutation],
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
