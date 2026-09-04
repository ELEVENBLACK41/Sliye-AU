/**
 * 本文件维护 AI Thread 的发送、调整方向、停止和重试命令。
 * 命令只提交用户意图；客户端投影统一写入 Zustand Store，最终消息与 Run 状态仍以服务端历史、POST SSE 和 GET SSE 为准。
 */
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import type {
  AiMessageHistoryItem,
  AiMessageSubmissionMode,
  AiRunStatus,
  AiThreadMessageSubmissionResult,
} from '@workspace/contracts/ai';

import { useAiPostStreamCoordinator, type AiPostStreamCoordinatorEvent } from '../components/ai-post-stream-provider';
import { retryAiRun, stopAiRun } from '../services/ai-thread-client.service';
import { useAiThreadWorkspaceStore } from '../store/ai-thread-workspace.store';
import type { AiWorkspaceCommandState } from '../types/ai-workspace';
import {
  applyAiLiveDelta,
  applyAiRunSnapshot,
  createAiEventReducerState,
  isAiRunActive,
  isAiRunTerminal,
  reduceAiEvent,
  type AiEventReducerState,
} from '../utils/ai-event-reducer';
import { isAiPostStreamEventForCurrentRun } from '../utils/ai-post-stream-routing';

/** Thread 命令 Hook 所需的路由和服务端刷新能力。 */
type AiThreadCommandOptions = {
  /** 当前 URL 指向的 Thread 标识；为空时发送会创建新 Thread。 */
  threadId: string | undefined;
  /** 刷新当前 Thread 详情和消息历史。 */
  refreshCurrentThread: () => Promise<void>;
  /** 刷新活动侧栏列表。 */
  refreshThreadLists: (signal?: AbortSignal) => Promise<void>;
};

/** 从未知异常中提取可安全展示的错误文案。 */
function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** 将 POST 流中可识别的 Run 事件投影到侧栏活动状态。 */
function updateThreadActivityFromPostEvent(
  event: AiPostStreamCoordinatorEvent,
  markThreadRunStarted: (threadId: string, runId: string) => void,
  markThreadRunStatus: (threadId: string, runId: string, status: AiRunStatus) => void,
): void {
  if (event.kind === 'SUBMISSION' && event.data.runId) {
    markThreadRunStarted(event.data.threadId, event.data.runId);
    return;
  }

  if (event.kind === 'RUN_STATUS') {
    if (event.data.nextRunId) {
      markThreadRunStarted(event.data.threadId, event.data.nextRunId);
      return;
    }
    markThreadRunStatus(event.data.threadId, event.data.runId, event.data.status);
  }
}

/** 维护当前 Thread 的所有用户命令及其浏览器生命周期状态。 */
export function useAiThreadCommands({ threadId, refreshCurrentThread, refreshThreadLists }: AiThreadCommandOptions) {
  const router = useRouter();
  const commandState = useAiThreadWorkspaceStore((state) => state.commandState);
  const commandError = useAiThreadWorkspaceStore((state) => state.commandError);
  const updateThreadState = useAiThreadWorkspaceStore((state) => state.updateThreadState);
  const updateRunEventState = useAiThreadWorkspaceStore((state) => state.updateRunEventState);
  const updateLocalQueuedMessages = useAiThreadWorkspaceStore((state) => state.updateLocalQueuedMessages);
  const setSteeringRunId = useAiThreadWorkspaceStore((state) => state.setSteeringRunId);
  const setPostStreamRunId = useAiThreadWorkspaceStore((state) => state.setPostStreamRunId);
  const setStreamState = useAiThreadWorkspaceStore((state) => state.setStreamState);
  const setStreamError = useAiThreadWorkspaceStore((state) => state.setStreamError);
  const setCommandState = useAiThreadWorkspaceStore((state) => state.setCommandState);
  const setCommandError = useAiThreadWorkspaceStore((state) => state.setCommandError);
  const isCurrentRequestVersion = useAiThreadWorkspaceStore((state) => state.isCurrentRequestVersion);
  const markThreadRunStarted = useAiThreadWorkspaceStore((state) => state.markThreadRunStarted);
  const markThreadRunStatus = useAiThreadWorkspaceStore((state) => state.markThreadRunStatus);
  const terminalPostRunIdsRef = useRef(new Set<string>());
  const postStreamThreadIdRef = useRef<string | null>(null);
  const postStreamRunIdRef = useRef<string | null>(null);
  const { start: startPostStream, subscribe: subscribeToPostStream } = useAiPostStreamCoordinator();

  /** 同步命令状态到 Store，挡住同一事件循环内的重复点击。 */
  const setCommandLifecycleState = useCallback(
    (nextState: AiWorkspaceCommandState) => {
      setCommandState(nextState);
    },
    [setCommandState],
  );

  /** 路由切换时清空旧命令错误，避免上一条 Thread 的错误污染当前会话。 */
  useEffect(() => {
    postStreamThreadIdRef.current = null;
    postStreamRunIdRef.current = null;
    terminalPostRunIdsRef.current.clear();
    queueMicrotask(() => {
      setCommandState('IDLE');
      setCommandError(null);
    });
  }, [setCommandError, setCommandState, threadId]);

  /** 取得当前仍占用 Thread 单 Run 门禁的 Run 标识。 */
  const getActiveRunId = useCallback((): string | null => {
    const workspace = useAiThreadWorkspaceStore.getState();
    const liveRun = workspace.runEventState;
    if (liveRun) {
      return isAiRunActive(liveRun.status) ? liveRun.runId : null;
    }

    return workspace.threadState.activeRun?.runId ?? null;
  }, []);

  /** 把服务端确认的历史/调整方向投递结果同步到输入框上方的本地即时状态。 */
  const rememberQueuedSubmission = useCallback(
    (content: string, result: AiThreadMessageSubmissionResult) => {
      updateLocalQueuedMessages((current) => {
        const withoutReplaced =
          result.submissionMode === 'STEER' ? current.filter((message) => message.id === result.messageId) : current;
        const withoutCurrent = withoutReplaced.filter((message) => message.id !== result.messageId);

        if (result.dispatchState !== 'QUEUED') return withoutCurrent;

        return [
          ...withoutCurrent,
          {
            id: result.messageId,
            content,
            queueSequence: result.queueSequence,
            submissionMode: result.submissionMode,
            isSteering: false,
          },
        ];
      });
    },
    [updateLocalQueuedMessages],
  );

  /** 把 POST submission 结果立即投影到消息历史和当前 Run，避免额外 GET 发现新 Run。 */
  const applyPostStreamSubmission = useCallback(
    (content: string, result: AiThreadMessageSubmissionResult) => {
      rememberQueuedSubmission(content, result);
      if (result.runId) {
        postStreamRunIdRef.current = result.runId;
      }
      const createdAt = new Date().toISOString();
      const submittedMessage: AiMessageHistoryItem = {
        id: result.messageId,
        threadId: result.threadId,
        runId: null,
        authorUserId: null,
        role: 'USER',
        dispatchState: result.dispatchState,
        queueSequence: result.queueSequence,
        submissionMode: result.submissionMode,
        content,
        createdAt,
        run: null,
        contentVisibility: 'VISIBLE',
      };

      updateThreadState((current) => {
        const messages = current.messages.some((message) => message.id === result.messageId)
          ? current.messages
          : [...current.messages, submittedMessage];

        if (!result.runId) {
          return { ...current, messages };
        }

        return {
          ...current,
          messages,
          thread: current.thread ? { ...current.thread, activeRunId: result.runId } : current.thread,
          activeRun: {
            runId: result.runId,
            status: 'RUNNING',
            createdAt,
          },
        };
      });

      if (!result.runId) {
        return;
      }

      const runId = result.runId;
      setPostStreamRunId(runId);
      setStreamState('CONNECTED');
      setStreamError(null);
      updateRunEventState((current) => {
        if (current?.runId === runId) {
          return current;
        }

        return createAiEventReducerState(runId, { status: 'RUNNING' });
      });
    },
    [
      rememberQueuedSubmission,
      setPostStreamRunId,
      setStreamError,
      setStreamState,
      updateRunEventState,
      updateThreadState,
    ],
  );

  /** 将 POST 流交给当前 Thread 的 GET SSE，从最后确认序号继续恢复。 */
  const handoffPostStreamToRecovery = useCallback(
    (runId: string, afterSequence: number, message?: string) => {
      const currentRunId =
        postStreamRunIdRef.current ?? useAiThreadWorkspaceStore.getState().runEventState?.runId ?? null;
      if (currentRunId !== runId) return;

      updateRunEventState((state) => {
        if (!state || state.runId !== runId) return state;
        return {
          ...state,
          lastSequence: Math.max(state.lastSequence, afterSequence),
        };
      });
      setStreamError(message ?? null);
      if (postStreamRunIdRef.current === runId) {
        postStreamRunIdRef.current = null;
      }
      setPostStreamRunId(null);
      setStreamState('RECONNECTING');
    },
    [setPostStreamRunId, setStreamError, setStreamState, updateRunEventState],
  );

  /** 订阅稳定布局托管的 POST 流，让路由切换后的新 Hook 能继续消费同一读取器。 */
  useEffect(() => {
    /** 判断 POST 流事件是否属于当前或刚完成路由切换的 Thread。 */
    function isCurrentPostStreamEvent(event: AiPostStreamCoordinatorEvent): boolean {
      const workspace = useAiThreadWorkspaceStore.getState();
      return isAiPostStreamEventForCurrentRun(event, {
        threadId,
        postStreamThreadId: postStreamThreadIdRef.current,
        activeRunId: postStreamRunIdRef.current ?? workspace.runEventState?.runId ?? null,
      });
    }

    /** 处理协调器发来的单条 POST 流事件。 */
    function handlePostStreamEvent(event: AiPostStreamCoordinatorEvent): void {
      updateThreadActivityFromPostEvent(event, markThreadRunStarted, markThreadRunStatus);
      if (!isCurrentPostStreamEvent(event)) return;

      if (event.kind === 'SUBMISSION') {
        postStreamThreadIdRef.current = event.data.threadId;
        applyPostStreamSubmission(event.message, event.data);
        return;
      }

      if (event.kind === 'LIVE_DELTA') {
        updateRunEventState((current) => {
          const previous = current ?? createAiEventReducerState(event.data.runId, { status: 'RUNNING' });
          return applyAiLiveDelta(previous, event.data);
        });
        return;
      }

      if (event.kind === 'AI_EVENT') {
        const runId =
          event.data && typeof event.data === 'object' && 'runId' in event.data
            ? (event.data as { runId?: unknown }).runId
            : null;
        if (typeof runId !== 'string') return;
        updateRunEventState((current) => {
          const previous = current ?? createAiEventReducerState(runId, { status: 'RUNNING' });
          return reduceAiEvent(previous, event.data);
        });
        return;
      }

      if (event.kind === 'RUN_STATUS') {
        updateRunEventState((current) => {
          const previous = current ?? createAiEventReducerState(event.data.runId, { status: 'RUNNING' });
          return applyAiRunSnapshot(previous, event.data);
        });

        if (!isAiRunTerminal(event.data.status)) return;

        terminalPostRunIdsRef.current.add(event.data.runId);
        if (postStreamRunIdRef.current === event.data.runId) {
          postStreamRunIdRef.current = null;
        }
        setPostStreamRunId(null);
        setStreamState('IDLE');
        if (!event.data.nextRunId) {
          updateThreadState((current) => {
            if (current.activeRun?.runId !== event.data.runId) return current;
            return {
              ...current,
              thread: current.thread ? { ...current.thread, activeRunId: null } : current.thread,
              activeRun: null,
            };
          });
        }
        void refreshCurrentThread();
        return;
      }

      if (event.kind === 'STREAM_ERROR') {
        setStreamError(event.data.message);
        return;
      }

      if (event.kind === 'COMPLETED') {
        const runId = event.submission.runId;
        if (!runId) return;

        if (event.completion.handoff?.reason === 'POST_STREAM_COMPLETED' && terminalPostRunIdsRef.current.has(runId)) {
          setStreamState('IDLE');
          return;
        }

        if (event.completion.streamError) {
          handoffPostStreamToRecovery(
            runId,
            event.completion.handoff?.afterSequence ??
              useAiThreadWorkspaceStore.getState().runEventState?.lastSequence ??
              0,
            event.completion.streamError.message,
          );
          return;
        }

        handoffPostStreamToRecovery(runId, event.completion.handoff?.afterSequence ?? 0);
        return;
      }

      if (event.kind === 'FAILED' && event.submission?.runId) {
        handoffPostStreamToRecovery(
          event.submission.runId,
          useAiThreadWorkspaceStore.getState().runEventState?.lastSequence ?? 0,
          toErrorMessage(event.error, '实时回答连接暂时不可用'),
        );
      }
    }

    return subscribeToPostStream(handlePostStreamEvent);
  }, [
    applyPostStreamSubmission,
    handoffPostStreamToRecovery,
    markThreadRunStarted,
    markThreadRunStatus,
    refreshCurrentThread,
    setPostStreamRunId,
    setStreamError,
    setStreamState,
    subscribeToPostStream,
    threadId,
    updateRunEventState,
    updateThreadState,
  ]);

  /** 将停止或调整方向的服务端状态先投影到当前 Run，再等待事件或刷新确认。 */
  const applyRunControlResult = useCallback(
    (result: { runId: string; status: AiEventReducerState['status']; nextRunId: string | null }) => {
      updateRunEventState((current) => {
        if (!current || current.runId !== result.runId || !result.status) return current;
        return { ...current, status: result.status };
      });

      if (result.status && isAiRunTerminal(result.status) && !result.nextRunId) {
        updateThreadState((current) => {
          if (current.activeRun?.runId !== result.runId) return current;
          return {
            ...current,
            thread: current.thread ? { ...current.thread, activeRunId: null } : current.thread,
            activeRun: null,
          };
        });
      }
    },
    [updateRunEventState, updateThreadState],
  );

  /** 为一次用户操作生成稳定幂等键；请求重试会复用同一个请求体。 */
  const createIdempotencyKey = useCallback((): string => crypto.randomUUID(), []);

  /** 提交用户消息；既有 Thread 存在活跃 Run 时，普通消息不再进入队列。 */
  const submitMessage = useCallback(
    async (message: string, submissionMode: AiMessageSubmissionMode = 'NORMAL'): Promise<boolean> => {
      const content = message.trim();
      if (!content || useAiThreadWorkspaceStore.getState().commandState !== 'IDLE') return false;

      const requestVersion = useAiThreadWorkspaceStore.getState().requestVersion;
      const requestVersionThreadId = threadId;
      if (submissionMode === 'NORMAL' && requestVersionThreadId && getActiveRunId() !== null) {
        setCommandError('当前回答尚未完成，请先停止或等待完成后再发送消息');
        return false;
      }

      const idempotencyKey = createIdempotencyKey();
      setCommandLifecycleState('SUBMITTING');
      setCommandError(null);

      try {
        const postStream = startPostStream(
          requestVersionThreadId
            ? {
                source: 'EXISTING_THREAD',
                threadId: requestVersionThreadId,
                message: content,
                body: { message: content, idempotencyKey, submissionMode },
              }
            : {
                source: 'NEW_THREAD',
                message: content,
                body: { message: content, idempotencyKey },
              },
        );
        const result = await postStream.submission;
        if (!isCurrentRequestVersion(requestVersion) || requestVersionThreadId !== threadId) return false;

        if (!requestVersionThreadId) {
          void refreshThreadLists();
          router.push(`/ai/${encodeURIComponent(result.threadId)}`);
          return true;
        }

        if (submissionMode === 'STEER' && result.runId === null) {
          setSteeringRunId(getActiveRunId());
        }
        return true;
      } catch (error: unknown) {
        if (!isCurrentRequestVersion(requestVersion) || requestVersionThreadId !== threadId) return false;
        setCommandError(toErrorMessage(error, 'AI 消息发送失败，请稍后重试'));
        return false;
      } finally {
        setCommandLifecycleState('IDLE');
      }
    },
    [
      createIdempotencyKey,
      getActiveRunId,
      isCurrentRequestVersion,
      refreshThreadLists,
      router,
      setCommandError,
      setCommandLifecycleState,
      setSteeringRunId,
      startPostStream,
      threadId,
    ],
  );

  /** 请求停止当前 Run；最终状态只由 SSE 或服务端刷新确认。 */
  const stopCurrentRun = useCallback(async (): Promise<void> => {
    const runId = getActiveRunId();
    if (!runId || useAiThreadWorkspaceStore.getState().commandState !== 'IDLE') return;

    const requestVersion = useAiThreadWorkspaceStore.getState().requestVersion;
    const requestVersionThreadId = threadId;
    setCommandLifecycleState('STOPPING');
    setCommandError(null);

    try {
      const result = await stopAiRun(runId);
      if (!isCurrentRequestVersion(requestVersion) || requestVersionThreadId !== threadId) return;

      applyRunControlResult(result);
      if (isAiRunTerminal(result.status) || result.nextRunId) void refreshCurrentThread();
    } catch (error: unknown) {
      if (!isCurrentRequestVersion(requestVersion) || requestVersionThreadId !== threadId) return;
      setCommandError(toErrorMessage(error, 'AI 运行停止失败，请稍后重试'));
    } finally {
      setCommandLifecycleState('IDLE');
    }
  }, [
    applyRunControlResult,
    getActiveRunId,
    isCurrentRequestVersion,
    refreshCurrentThread,
    setCommandError,
    setCommandLifecycleState,
    threadId,
  ]);

  /** 从失败或取消的历史 Run 创建新 Run，并重新以服务端详情建立订阅。 */
  const retryRun = useCallback(
    async (runId: string): Promise<void> => {
      if (useAiThreadWorkspaceStore.getState().commandState !== 'IDLE' || getActiveRunId()) return;

      const requestVersion = useAiThreadWorkspaceStore.getState().requestVersion;
      const requestVersionThreadId = threadId;
      setCommandLifecycleState('RETRYING');
      setCommandError(null);

      try {
        await retryAiRun(runId, { idempotencyKey: createIdempotencyKey() });
        if (!isCurrentRequestVersion(requestVersion) || requestVersionThreadId !== threadId) return;
        await refreshCurrentThread();
      } catch (error: unknown) {
        if (!isCurrentRequestVersion(requestVersion) || requestVersionThreadId !== threadId) return;
        setCommandError(toErrorMessage(error, 'AI 运行重试失败，请稍后重试'));
      } finally {
        setCommandLifecycleState('IDLE');
      }
    },
    [
      createIdempotencyKey,
      getActiveRunId,
      isCurrentRequestVersion,
      refreshCurrentThread,
      setCommandError,
      setCommandLifecycleState,
      threadId,
    ],
  );

  return { commandState, commandError, submitMessage, stopCurrentRun, retryRun };
}
