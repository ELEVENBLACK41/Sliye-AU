/**
 * 本文件维护 AI Thread 的发送、排队、调整方向、停止和重试命令。
 * 命令只提交用户意图，最终消息与 Run 状态仍以服务端历史、POST SSE 和 GET SSE 为准。
 */
'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { useRouter } from 'next/navigation';

import type {
  AiMessageHistoryItem,
  AiMessageSubmissionMode,
  AiThreadMessageSubmissionResult,
} from '@workspace/contracts/ai';

import { useAiPostStreamCoordinator, type AiPostStreamCoordinatorEvent } from '../components/ai-post-stream-provider';
import { retryAiRun, stopAiRun } from '../services/ai-thread-client.service';
import type {
  AiWorkspaceCommandState,
  AiWorkspaceQueuedMessage,
  AiWorkspaceStreamState,
  AiWorkspaceThreadState,
} from '../types/ai-workspace';
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

/** Thread 命令 Hook 需要的共享状态和异步刷新能力。 */
type AiThreadCommandOptions = {
  /** 当前 URL 指向的 Thread 标识；为空时发送会创建新 Thread。 */
  threadId: string | undefined;
  /** 当前 Thread 状态，用于判断是否仍有活跃 Run。 */
  threadState: AiWorkspaceThreadState;
  /** 更新当前 Thread 状态，用于同步服务端确认的终态。 */
  setThreadState: Dispatch<SetStateAction<AiWorkspaceThreadState>>;
  /** 当前 Run 的事件状态引用。 */
  runEventStateRef: MutableRefObject<AiEventReducerState | null>;
  /** Thread 路由请求版本，用于拒绝旧命令响应写回新会话。 */
  requestVersionRef: MutableRefObject<number>;
  /** 以同一 reducer 引用更新实时 Run 状态。 */
  updateRunEventState: (updater: (current: AiEventReducerState | null) => AiEventReducerState | null) => void;
  /** 刷新当前 Thread 详情和消息历史。 */
  refreshCurrentThread: () => Promise<void>;
  /** 刷新活动侧栏列表。 */
  refreshThreadLists: (signal?: AbortSignal) => Promise<void>;
  /** 更新输入框上方的本地排队确认。 */
  setLocalQueuedMessages: Dispatch<SetStateAction<AiWorkspaceQueuedMessage[]>>;
  /** 更新调整方向期间的旧 Run 标识。 */
  setSteeringRunId: Dispatch<SetStateAction<string | null>>;
  /** 当前 POST 直出流拥有的 Run 标识，用于屏蔽重复 GET SSE。 */
  setPostStreamRunId: Dispatch<SetStateAction<string | null>>;
  /** 更新工作区当前领域流状态。 */
  setStreamState: Dispatch<SetStateAction<AiWorkspaceStreamState>>;
  /** 更新工作区当前领域流错误。 */
  setStreamError: Dispatch<SetStateAction<string | null>>;
};

/** 从未知异常中提取可安全展示的错误文案。 */
function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** 维护当前 Thread 的所有用户命令及其浏览器生命周期状态。 */
export function useAiThreadCommands({
  threadId,
  threadState,
  setThreadState,
  runEventStateRef,
  requestVersionRef,
  updateRunEventState,
  refreshCurrentThread,
  refreshThreadLists,
  setLocalQueuedMessages,
  setSteeringRunId,
  setPostStreamRunId,
  setStreamState,
  setStreamError,
}: AiThreadCommandOptions) {
  const router = useRouter();
  const [commandState, setCommandState] = useState<AiWorkspaceCommandState>('IDLE');
  const commandStateRef = useRef<AiWorkspaceCommandState>('IDLE');
  const [commandError, setCommandError] = useState<string | null>(null);
  const terminalPostRunIdsRef = useRef(new Set<string>());
  const postStreamThreadIdRef = useRef<string | null>(null);
  const postStreamRunIdRef = useRef<string | null>(null);
  const { start: startPostStream, subscribe: subscribeToPostStream } = useAiPostStreamCoordinator();

  /** 同步更新命令状态引用和 React 状态，挡住同一事件循环内的重复点击。 */
  const setCommandLifecycleState = useCallback((nextState: AiWorkspaceCommandState) => {
    commandStateRef.current = nextState;
    setCommandState(nextState);
  }, []);

  /** 路由切换时清空旧命令错误，避免上一条 Thread 的错误污染当前会话。 */
  useEffect(() => {
    postStreamThreadIdRef.current = null;
    postStreamRunIdRef.current = null;
    terminalPostRunIdsRef.current.clear();
    queueMicrotask(() => {
      commandStateRef.current = 'IDLE';
      setCommandState('IDLE');
      setCommandError(null);
    });
  }, [threadId]);

  /** 取得当前仍占用 Thread 单 Run 门禁的 Run 标识。 */
  const getActiveRunId = useCallback((): string | null => {
    const liveRun = runEventStateRef.current;
    if (liveRun) {
      return isAiRunActive(liveRun.status) ? liveRun.runId : null;
    }

    return threadState.activeRun?.runId ?? null;
  }, [runEventStateRef, threadState.activeRun?.runId]);

  /** 把服务端确认的排队投递结果同步到输入框上方的本地即时状态。 */
  const rememberQueuedSubmission = useCallback(
    (content: string, result: AiThreadMessageSubmissionResult) => {
      setLocalQueuedMessages((current) => {
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
    [setLocalQueuedMessages],
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
        parts: [{ type: 'text', text: content }],
        metadata: null,
        createdAt,
        run: null,
        contentVisibility: 'VISIBLE',
      };

      setThreadState((current) => {
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
    [rememberQueuedSubmission, setPostStreamRunId, setStreamError, setStreamState, setThreadState, updateRunEventState],
  );

  /** 将 POST 流交给当前 Thread 的 GET SSE，从最后确认序号继续恢复。 */
  const handoffPostStreamToRecovery = useCallback(
    (runId: string, afterSequence: number, message?: string) => {
      const currentRunId = postStreamRunIdRef.current ?? runEventStateRef.current?.runId ?? null;
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
    [runEventStateRef, setPostStreamRunId, setStreamError, setStreamState, updateRunEventState],
  );

  /** 订阅稳定布局托管的 POST 流，让路由切换后的新 Hook 能继续消费同一读取器。 */
  useEffect(() => {
    /** 判断 POST 流事件是否属于当前或刚完成路由切换的 Thread。 */
    function isCurrentPostStreamEvent(event: AiPostStreamCoordinatorEvent): boolean {
      return isAiPostStreamEventForCurrentRun(event, {
        threadId,
        postStreamThreadId: postStreamThreadIdRef.current,
        activeRunId: postStreamRunIdRef.current ?? runEventStateRef.current?.runId ?? null,
      });
    }

    /** 处理协调器发来的单条 POST 流事件。 */
    function handlePostStreamEvent(event: AiPostStreamCoordinatorEvent): void {
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
          setThreadState((current) => {
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
            event.completion.handoff?.afterSequence ?? runEventStateRef.current?.lastSequence ?? 0,
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
          runEventStateRef.current?.lastSequence ?? 0,
          toErrorMessage(event.error, '实时回答连接暂时不可用'),
        );
      }
    }

    return subscribeToPostStream(handlePostStreamEvent);
  }, [
    applyPostStreamSubmission,
    handoffPostStreamToRecovery,
    refreshCurrentThread,
    runEventStateRef,
    setPostStreamRunId,
    setStreamError,
    setStreamState,
    setThreadState,
    subscribeToPostStream,
    threadId,
    updateRunEventState,
  ]);

  /** 将停止或调整方向的服务端状态先投影到当前 Run，再等待事件或刷新确认。 */
  const applyRunControlResult = useCallback(
    (result: { runId: string; status: AiEventReducerState['status']; nextRunId: string | null }) => {
      updateRunEventState((current) => {
        if (!current || current.runId !== result.runId || !result.status) return current;
        return { ...current, status: result.status };
      });

      if (result.status && isAiRunTerminal(result.status)) {
        if (!result.nextRunId) {
          setThreadState((current) => {
            if (current.activeRun?.runId !== result.runId) return current;
            return {
              ...current,
              thread: current.thread ? { ...current.thread, activeRunId: null } : current.thread,
              activeRun: null,
            };
          });
        }
      }
    },
    [setThreadState, updateRunEventState],
  );

  /** 为一次用户操作生成稳定幂等键；请求重试会复用同一个请求体。 */
  const createIdempotencyKey = useCallback((): string => crypto.randomUUID(), []);

  /** 提交用户消息；新会话创建 Thread，既有会话按服务端状态立即执行或排队。 */
  const submitMessage = useCallback(
    async (message: string, submissionMode: AiMessageSubmissionMode = 'NORMAL'): Promise<boolean> => {
      const content = message.trim();
      if (!content || commandStateRef.current !== 'IDLE') return false;

      const requestVersion = requestVersionRef.current;
      const requestVersionThreadId = threadId;
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
        if (requestVersion !== requestVersionRef.current || requestVersionThreadId !== threadId) return false;

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
        if (requestVersion !== requestVersionRef.current || requestVersionThreadId !== threadId) return false;
        setCommandError(toErrorMessage(error, 'AI 消息发送失败，请稍后重试'));
        return false;
      } finally {
        setCommandLifecycleState('IDLE');
      }
    },
    [
      createIdempotencyKey,
      getActiveRunId,
      refreshThreadLists,
      requestVersionRef,
      router,
      setCommandLifecycleState,
      setSteeringRunId,
      threadId,
      startPostStream,
    ],
  );

  /** 请求停止当前 Run；最终状态只由 SSE 或服务端刷新确认。 */
  const stopCurrentRun = useCallback(async (): Promise<void> => {
    const runId = getActiveRunId();
    if (!runId || commandStateRef.current !== 'IDLE') return;

    const requestVersion = requestVersionRef.current;
    const requestVersionThreadId = threadId;
    setCommandLifecycleState('STOPPING');
    setCommandError(null);

    try {
      const result = await stopAiRun(runId);
      if (requestVersion !== requestVersionRef.current || requestVersionThreadId !== threadId) return;

      applyRunControlResult(result);
      if (isAiRunTerminal(result.status) || result.nextRunId) void refreshCurrentThread();
    } catch (error: unknown) {
      if (requestVersion !== requestVersionRef.current || requestVersionThreadId !== threadId) return;
      setCommandError(toErrorMessage(error, 'AI 运行停止失败，请稍后重试'));
    } finally {
      setCommandLifecycleState('IDLE');
    }
  }, [
    applyRunControlResult,
    getActiveRunId,
    refreshCurrentThread,
    requestVersionRef,
    setCommandLifecycleState,
    threadId,
  ]);

  /** 从失败或取消的历史 Run 创建新 Run，并重新以服务端详情建立订阅。 */
  const retryRun = useCallback(
    async (runId: string): Promise<void> => {
      if (commandStateRef.current !== 'IDLE' || getActiveRunId()) return;

      const requestVersion = requestVersionRef.current;
      const requestVersionThreadId = threadId;
      setCommandLifecycleState('RETRYING');
      setCommandError(null);

      try {
        await retryAiRun(runId, { idempotencyKey: createIdempotencyKey() });
        if (requestVersion !== requestVersionRef.current || requestVersionThreadId !== threadId) return;
        await refreshCurrentThread();
      } catch (error: unknown) {
        if (requestVersion !== requestVersionRef.current || requestVersionThreadId !== threadId) return;
        setCommandError(toErrorMessage(error, 'AI 运行重试失败，请稍后重试'));
      } finally {
        setCommandLifecycleState('IDLE');
      }
    },
    [createIdempotencyKey, getActiveRunId, refreshCurrentThread, requestVersionRef, setCommandLifecycleState, threadId],
  );

  return { commandState, commandError, submitMessage, stopCurrentRun, retryRun };
}
