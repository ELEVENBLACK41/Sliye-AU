/**
 * 本文件集中维护 AI Thread 详情、消息分页和权限范围失效状态，防止失权后的迟到结果恢复旧内容。
 */
'use client';

import type { MutableRefObject } from 'react';
import { useCallback, useRef, useState } from 'react';

import type { AiThreadDetail, AiThreadMessageHistoryItem } from '@workspace/contracts/ai';

import {
  getAiThreadMessages,
  getAiThreadSnapshot,
  type AiThreadSnapshot,
} from '../services/ai-thread.service';
import type { AiDecisionUiMessage } from '../types/ai-message';
import { mergeAiThreadHistoryItems, toAiDecisionUiMessages } from '../utils/ai-thread-timeline';
import {
  canApplyAiThreadRequestResult,
  isAiThreadScopeChangedError,
  toAiWorkspaceErrorMessage,
} from '../utils/ai-workspace-state';

/** 工作区与结算轮询统一读取的最近消息数量。 */
export const AI_THREAD_MESSAGE_PAGE_SIZE = 50;

/** Thread 内容状态 Hook 的接入参数。 */
type UseAiThreadContentOptions = {
  /** 首次进入是否正在恢复深链接。 */
  initialLoading: boolean;
  /** 当前路由选中的 Thread 引用。 */
  selectedThreadIdRef: MutableRefObject<string | null>;
  /** 当前 Chat 仅断开浏览器流的入口。 */
  disconnectRef: MutableRefObject<(() => Promise<void>) | null>;
  /** 从历史列表撤下已经锁定的 Thread。 */
  onScopeChanged: (threadId: string) => void;
};

/** 维护当前 Thread 的权威内容，并通过范围代次拒绝权限变化前的迟到响应。 */
export function useAiThreadContent({
  initialLoading,
  selectedThreadIdRef,
  disconnectRef,
  onScopeChanged,
}: UseAiThreadContentOptions) {
  const [thread, setThread] = useState<AiThreadDetail | null>(null);
  const [historyItems, setHistoryItems] = useState<AiThreadMessageHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(initialLoading);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [scopeChanged, setScopeChanged] = useState(false);
  const threadRequestSequence = useRef(0);
  const threadScopeVersionRef = useRef(0);

  /** 判断异步结果是否仍属于当前 Thread 和未失效的权限代次。 */
  const canApplyThreadResult = useCallback((threadId: string, requestScopeVersion: number): boolean => {
    return canApplyAiThreadRequestResult(
      threadId,
      selectedThreadIdRef.current,
      requestScopeVersion,
      threadScopeVersionRef.current,
    );
  }, [selectedThreadIdRef]);

  /** 返回当前权限范围代次，供 Run 结算轮询固定本次读取身份。 */
  const getThreadScopeVersion = useCallback((): number => threadScopeVersionRef.current, []);

  /** 切换 Thread 或草稿时清空旧内容，并使此前所有异步读取立即失效。 */
  const resetThreadContent = useCallback((loading: boolean): void => {
    threadScopeVersionRef.current += 1;
    threadRequestSequence.current += 1;
    setThread(null);
    setHistoryItems([]);
    setHistoryError(null);
    setHistoryLoading(loading);
    setMessageCursor(null);
    setHasOlderMessages(false);
    setScopeChanged(false);
  }, []);

  /** 使用已通过 BFF 鉴权的详情更新当前 Thread。 */
  const setThreadDetail = useCallback((detail: AiThreadDetail): void => {
    setThread(detail);
    setScopeChanged(false);
  }, []);

  /** 展示不会替换当前时间流的普通读取错误。 */
  const showThreadError = useCallback((message: string): void => {
    setHistoryError(message);
  }, []);

  /** 识别稳定范围错误后撤下旧内容、列表项和仍在消费的浏览器流。 */
  const invalidateThreadScope = useCallback((threadId: string, error: unknown): boolean => {
    if (!isAiThreadScopeChangedError(error)) {
      return false;
    }

    onScopeChanged(threadId);
    if (selectedThreadIdRef.current !== threadId) {
      return true;
    }

    threadScopeVersionRef.current += 1;
    threadRequestSequence.current += 1;
    const disconnect = disconnectRef.current;
    disconnectRef.current = null;
    if (disconnect) void disconnect().catch(() => undefined);
    setThread(null);
    setHistoryItems([]);
    setHistoryError(toAiWorkspaceErrorMessage(error, 'AI 会话权限范围已变化'));
    setHistoryLoading(false);
    setMessageCursor(null);
    setHasOlderMessages(false);
    setScopeChanged(true);
    return true;
  }, [disconnectRef, onScopeChanged, selectedThreadIdRef]);

  /** 应用仍属于当前权限代次的 Thread 快照。 */
  const applyThreadSnapshot = useCallback((
    threadId: string,
    snapshot: AiThreadSnapshot,
    preserveOlder: boolean,
    requestScopeVersion: number,
  ): boolean => {
    if (!canApplyThreadResult(threadId, requestScopeVersion)) {
      return false;
    }

    setThread(snapshot.detail);
    setHistoryItems((current) =>
      preserveOlder ? mergeAiThreadHistoryItems(current, snapshot.items) : snapshot.items,
    );
    if (!preserveOlder) {
      setMessageCursor(snapshot.nextCursor);
      setHasOlderMessages(snapshot.hasMore);
    }
    setHistoryError(null);
    setScopeChanged(false);
    return true;
  }, [canApplyThreadResult]);

  /** 读取当前 Thread 首屏，并让范围错误优先于普通加载错误处理。 */
  const reloadThread = useCallback(async (
    threadId: string,
    silent = false,
    preserveOlder = false,
  ): Promise<AiDecisionUiMessage[] | null> => {
    const requestSequence = ++threadRequestSequence.current;
    const requestScopeVersion = threadScopeVersionRef.current;
    if (!silent) setHistoryLoading(true);

    try {
      const snapshot = await getAiThreadSnapshot(threadId, AI_THREAD_MESSAGE_PAGE_SIZE);
      if (
        requestSequence !== threadRequestSequence.current ||
        !applyThreadSnapshot(threadId, snapshot, preserveOlder, requestScopeVersion)
      ) {
        return null;
      }
      return toAiDecisionUiMessages(snapshot.items);
    } catch (error) {
      if (invalidateThreadScope(threadId, error)) return null;
      if (
        requestSequence === threadRequestSequence.current &&
        canApplyThreadResult(threadId, requestScopeVersion)
      ) {
        setHistoryError(toAiWorkspaceErrorMessage(error, '当前 AI 会话加载失败，请稍后重试'));
      }
      return null;
    } finally {
      if (
        requestSequence === threadRequestSequence.current &&
        requestScopeVersion === threadScopeVersionRef.current &&
        !silent
      ) {
        setHistoryLoading(false);
      }
    }
  }, [applyThreadSnapshot, canApplyThreadResult, invalidateThreadScope]);

  /** 使用消息游标向前加载，并拒绝权限失效前返回的历史页。 */
  const loadOlderMessages = useCallback(async (): Promise<void> => {
    const threadId = selectedThreadIdRef.current;
    if (!threadId || !messageCursor || historyLoading) return;

    const requestScopeVersion = threadScopeVersionRef.current;
    setHistoryLoading(true);
    try {
      const page = await getAiThreadMessages(threadId, {
        cursor: messageCursor,
        limit: AI_THREAD_MESSAGE_PAGE_SIZE,
      });
      if (!canApplyThreadResult(threadId, requestScopeVersion)) return;

      setHistoryItems((current) => mergeAiThreadHistoryItems(page.items, current));
      setMessageCursor(page.nextCursor);
      setHasOlderMessages(page.hasMore);
      setHistoryError(null);
    } catch (error) {
      if (invalidateThreadScope(threadId, error)) return;
      if (canApplyThreadResult(threadId, requestScopeVersion)) {
        setHistoryError(toAiWorkspaceErrorMessage(error, '更早消息加载失败，请稍后重试'));
      }
    } finally {
      if (canApplyThreadResult(threadId, requestScopeVersion)) setHistoryLoading(false);
    }
  }, [canApplyThreadResult, historyLoading, invalidateThreadScope, messageCursor, selectedThreadIdRef]);

  return {
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
  };
}
