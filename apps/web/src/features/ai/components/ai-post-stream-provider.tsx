/**
 * 本文件提供 AI 工作区范围内的 POST 直出流协调器。
 *
 * 协调器挂在 `(ai)` 稳定布局中，负责托管跨 `/ai` 与 `/ai/:threadId` 路由切换的
 * 浏览器读取器，并向当前挂载的工作区 Hook 回放已有流事件；它不维护 Run 业务状态。
 */
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type {
  AiEvent,
  AiPostStreamErrorData,
  AiPostStreamHandoffData,
  AiPostStreamLiveDeltaData,
  AiPostStreamRunStatusData,
  AiPostStreamSubmissionData,
  CreateAiThreadMessageRequest,
  CreateAiThreadRequest,
} from '@workspace/contracts/ai';

import {
  startAiThreadCreationPostStream,
  startAiThreadMessagePostStream,
  type AiThreadPostStreamCompletion,
  type AiThreadPostStreamHandle,
  type AiThreadPostStreamHandlers,
} from '../services/ai-thread-post-stream.service';

/** 新会话或已有 Thread 的 POST 流来源。 */
export type AiPostStreamSource = 'NEW_THREAD' | 'EXISTING_THREAD';

/** 可由工作区 Hook 订阅的 POST 直出流事件。 */
export type AiPostStreamCoordinatorEvent =
  | {
      /** 提交回执事件。 */
      kind: 'SUBMISSION';
      /** 当前提交来源。 */
      source: AiPostStreamSource;
      /** 用户本次提交的原始正文，用于路由切换期间本地投影。 */
      message: string;
      /** 服务端提交结果。 */
      data: AiPostStreamSubmissionData;
    }
  | {
      /** 模型即时文本增量事件。 */
      kind: 'LIVE_DELTA';
      /** 即时增量。 */
      data: AiPostStreamLiveDeltaData;
    }
  | {
      /** 已持久化领域事件。 */
      kind: 'AI_EVENT';
      /** 事件所属 Thread。 */
      threadId: string;
      /** 领域事件负载，交由 reducer 继续校验。 */
      data: AiEvent | unknown;
    }
  | {
      /** Run 状态快照。 */
      kind: 'RUN_STATUS';
      /** 状态负载。 */
      data: AiPostStreamRunStatusData;
    }
  | {
      /** POST 流恢复提示。 */
      kind: 'HANDOFF';
      /** 恢复负载。 */
      data: AiPostStreamHandoffData;
    }
  | {
      /** 响应头后的稳定流错误。 */
      kind: 'STREAM_ERROR';
      /** 已知的 Thread 标识；提交前失败时为空。 */
      threadId: string | null;
      /** 已知的 Run 标识；提交前失败时为空。 */
      runId: string | null;
      /** 错误负载。 */
      data: AiPostStreamErrorData;
    }
  | {
      /** POST 流完成事件。 */
      kind: 'COMPLETED';
      /** 流来源。 */
      source: AiPostStreamSource;
      /** 用户提交正文。 */
      message: string;
      /** 最终提交数据；Transport 已收到 submission 才会完成。 */
      submission: AiPostStreamSubmissionData;
      /** 完成结果。 */
      completion: AiThreadPostStreamCompletion;
    }
  | {
      /** POST 流在提交前或读取过程中失败。 */
      kind: 'FAILED';
      /** 流来源。 */
      source: AiPostStreamSource;
      /** 已知的 Thread 标识；提交前失败时为空。 */
      threadId: string | null;
      /** 用户提交正文。 */
      message: string;
      /** 已收到的提交数据；提交前失败时为空。 */
      submission: AiPostStreamSubmissionData | null;
      /** 已知的 Run 标识；提交前失败时为空。 */
      runId: string | null;
      /** 原始错误，调用方决定展示或恢复策略。 */
      error: unknown;
    };

/** 新会话首发或已有 Thread 消息提交的协调器输入。 */
export type AiPostStreamStartInput =
  | {
      /** 新会话首发。 */
      source: 'NEW_THREAD';
      /** 用户本次提交正文。 */
      message: string;
      /** 新 Thread 创建请求体。 */
      body: CreateAiThreadRequest;
    }
  | {
      /** 已有 Thread 发送。 */
      source: 'EXISTING_THREAD';
      /** 用户本次提交正文。 */
      message: string;
      /** 已有 Thread 标识。 */
      threadId: string;
      /** 已有 Thread 消息请求体。 */
      body: CreateAiThreadMessageRequest;
    };

/** AI POST 直出流协调器的公开能力。 */
type AiPostStreamCoordinator = {
  /** 启动一个由协调器托管的 POST 流。 */
  start: (input: AiPostStreamStartInput) => AiThreadPostStreamHandle;
  /** 订阅当前和后续 POST 流事件；订阅时会先回放仍在进行的流。 */
  subscribe: (listener: (event: AiPostStreamCoordinatorEvent) => void) => () => void;
};

/** AI 工作区 POST 流协调器上下文。 */
const AiPostStreamCoordinatorContext = createContext<AiPostStreamCoordinator | null>(null);

/** 渲染挂在 AI 稳定布局中的 POST 流协调器 Provider。 */
export function AiPostStreamProvider({ children }: { children: ReactNode }) {
  const recordsRef = useRef<Set<AiPostStreamRecord>>(new Set());
  const listenersRef = useRef<Set<AiPostStreamListenerEntry>>(new Set());

  /** 向当前订阅者广播事件，并保留事件供路由切换后的新 Hook 回放。 */
  const emit = useCallback((record: AiPostStreamRecord, event: AiPostStreamCoordinatorEvent) => {
    record.events.push(event);
    listenersRef.current.forEach((entry) => {
      if (entry.ready) {
        entry.listener(event);
      } else {
        entry.pendingEvents.push(event);
      }
    });
  }, []);

  /** 启动 POST Transport，并把其事件生命周期托管到稳定布局。 */
  const start = useCallback(
    (input: AiPostStreamStartInput): AiThreadPostStreamHandle => {
      const record: AiPostStreamRecord = {
        source: input.source,
        message: input.message,
        threadId: input.source === 'EXISTING_THREAD' ? input.threadId : null,
        submission: null,
        events: [],
        handle: null,
      };
      recordsRef.current.add(record);

      /** 创建带协调器事件广播的 Transport 回调。 */
      const handlers: AiThreadPostStreamHandlers = {
        onSubmission: (submission) => {
          record.threadId = submission.threadId;
          record.submission = submission;
          emit(record, {
            kind: 'SUBMISSION',
            source: record.source,
            message: record.message,
            data: submission,
          });
        },
        onLiveDelta: (liveDelta) => emit(record, { kind: 'LIVE_DELTA', data: liveDelta }),
        onEvent: (event) => {
          if (!record.threadId) return;
          emit(record, { kind: 'AI_EVENT', threadId: record.threadId, data: event });
        },
        onStatus: (status) => emit(record, { kind: 'RUN_STATUS', data: status }),
        onHandoff: (handoff) => emit(record, { kind: 'HANDOFF', data: handoff }),
        onStreamError: (error) =>
          emit(record, {
            kind: 'STREAM_ERROR',
            threadId: record.threadId,
            runId: record.submission?.runId ?? null,
            data: error,
          }),
      };

      const handle =
        input.source === 'NEW_THREAD'
          ? startAiThreadCreationPostStream(input.body, handlers)
          : startAiThreadMessagePostStream(input.threadId, input.body, handlers);
      record.handle = handle;

      /** 在完整流结束后通知当前与后续工作区 Hook。 */
      void handle.completion
        .then((completion) => {
          if (record.threadId && record.submission) {
            emit(record, {
              kind: 'COMPLETED',
              source: record.source,
              message: record.message,
              submission: record.submission,
              completion,
            });
          }
        })
        .catch((error: unknown) => {
          emit(record, {
            kind: 'FAILED',
            source: record.source,
            threadId: record.threadId,
            message: record.message,
            submission: record.submission,
            runId: record.submission?.runId ?? null,
            error,
          });
        })
        .finally(() => {
          recordsRef.current.delete(record);
        });

      return handle;
    },
    [emit],
  );

  /** 订阅当前流事件，并先回放仍处于生命周期内的流记录。 */
  const subscribe = useCallback((listener: (event: AiPostStreamCoordinatorEvent) => void): (() => void) => {
    const entry: AiPostStreamListenerEntry = {
      listener,
      ready: false,
      pendingEvents: [],
    };
    const records = [...recordsRef.current];
    listenersRef.current.add(entry);

    queueMicrotask(() => {
      if (!listenersRef.current.has(entry)) return;

      const replayedEvents = new Set<AiPostStreamCoordinatorEvent>();
      records.forEach((record) => {
        record.events.forEach((event) => {
          replayedEvents.add(event);
          entry.listener(event);
        });
      });
      entry.ready = true;
      entry.pendingEvents.filter((event) => !replayedEvents.has(event)).forEach((event) => entry.listener(event));
      entry.pendingEvents.length = 0;
    });

    /** 取消当前订阅，不影响协调器继续托管 POST 流。 */
    return () => listenersRef.current.delete(entry);
  }, []);

  /** 离开 AI 一级路由时终止浏览器读取；服务端 Run 仍由 Runtime 自己收敛。 */
  useEffect(() => {
    const records = recordsRef.current;

    return () => {
      records.forEach((record) => record.handle?.abort());
      records.clear();
    };
  }, []);

  const value = useMemo(() => ({ start, subscribe }), [start, subscribe]);

  return <AiPostStreamCoordinatorContext.Provider value={value}>{children}</AiPostStreamCoordinatorContext.Provider>;
}

/** 读取当前 AI 工作区的 POST 流协调器。 */
export function useAiPostStreamCoordinator(): AiPostStreamCoordinator {
  const coordinator = useContext(AiPostStreamCoordinatorContext);

  if (!coordinator) {
    throw new Error('AiPostStreamProvider 未挂载，无法启动 AI POST 流');
  }

  return coordinator;
}

/** 稳定布局中仍在进行的一条 POST 流记录。 */
type AiPostStreamRecord = {
  /** 流来源。 */
  source: AiPostStreamSource;
  /** 用户提交正文。 */
  message: string;
  /** 已知 Thread 标识；新会话收到 submission 前为空。 */
  threadId: string | null;
  /** 已收到的提交结果。 */
  submission: AiPostStreamSubmissionData | null;
  /** 已广播事件历史。 */
  events: AiPostStreamCoordinatorEvent[];
  /** 底层 Transport 句柄。 */
  handle: AiThreadPostStreamHandle | null;
};

/** 协调器订阅项，ready 前暂存事件以避开路由状态重置时序。 */
type AiPostStreamListenerEntry = {
  /** 当前工作区事件回调。 */
  listener: (event: AiPostStreamCoordinatorEvent) => void;
  /** 是否已完成当前流历史回放。 */
  ready: boolean;
  /** 回放期间新到达的事件。 */
  pendingEvents: AiPostStreamCoordinatorEvent[];
};
