/**
 * 本文件集中维护 AI 工作区的浏览器侧状态投影。
 * Thread、Run 和 Event 的权威状态仍由 URL、NestJS 接口与 PostgreSQL 决定；
 * Store 只收敛当前工作区的消息、流、命令与本地展示状态，不持久化到 localStorage。
 */
'use client';

import { create } from 'zustand';

import type {
  AiWorkspaceThreadActivity,
  AiWorkspaceCommandState,
  AiWorkspaceLoadState,
  AiWorkspaceQueuedMessage,
  AiWorkspaceStreamState,
  AiWorkspaceThreadState,
} from '../types/ai-workspace';
import type { AiRunStatus } from '@workspace/contracts/ai';
import type { AiEventReducerState } from '../utils/ai-event-reducer';

/** 空工作区的初始 Thread 数据，避免新会话误显示为加载失败。 */
const EMPTY_THREAD_STATE: AiWorkspaceThreadState = {
  thread: null,
  activeRun: null,
  messages: [],
  messageCursor: null,
  hasMoreMessages: false,
};

/** 支持值或基于当前值计算下一状态的轻量更新器。 */
type StateUpdater<T> = T | ((current: T) => T);

/** AI 工作区客户端 Store 的状态与受控更新操作。 */
type AiThreadWorkspaceStore = {
  /** 当前 URL 对应 Thread 的详情、消息和活跃 Run 投影。 */
  threadState: AiWorkspaceThreadState;
  /** Thread 详情请求的展示状态。 */
  threadLoadState: AiWorkspaceLoadState;
  /** Thread 详情请求的安全错误文案。 */
  threadError: string | null;
  /** 消息历史请求的展示状态。 */
  messageLoadState: AiWorkspaceLoadState;
  /** 消息历史请求的安全错误文案。 */
  messageError: string | null;
  /** 当前 Run 的领域事件归约结果。 */
  runEventState: AiEventReducerState | null;
  /** POST 直出或 GET 恢复流的客户端生命周期。 */
  streamState: AiWorkspaceStreamState;
  /** 当前领域流的安全错误文案。 */
  streamError: string | null;
  /** 当前仍由 POST 直出流负责的 Run 标识。 */
  postStreamRunId: string | null;
  /** 已提交但尚未进入最终历史投影的本地队列展示。 */
  localQueuedMessages: AiWorkspaceQueuedMessage[];
  /** 调整方向时等待旧 Run 收敛的标识。 */
  steeringRunId: string | null;
  /** 当前发送、停止或重试请求的客户端生命周期。 */
  commandState: AiWorkspaceCommandState;
  /** 当前命令请求的安全错误文案。 */
  commandError: string | null;
  /** 用于拒绝路由切换后迟到响应的递增版本。 */
  requestVersion: number;
  /** 当前浏览器会话内各 Thread 的运行和完成提醒投影。 */
  threadActivityById: Record<string, AiWorkspaceThreadActivity>;
  /** 以值或函数形式更新当前 Thread 投影。 */
  updateThreadState: (updater: StateUpdater<AiWorkspaceThreadState>) => void;
  /** 更新 Thread 详情请求状态。 */
  setThreadLoadState: (state: AiWorkspaceLoadState) => void;
  /** 更新 Thread 详情错误。 */
  setThreadError: (error: string | null) => void;
  /** 更新消息请求状态。 */
  setMessageLoadState: (state: AiWorkspaceLoadState) => void;
  /** 更新消息请求错误。 */
  setMessageError: (error: string | null) => void;
  /** 以值或函数形式更新当前 Run 的事件归约状态。 */
  updateRunEventState: (updater: StateUpdater<AiEventReducerState | null>) => void;
  /** 更新领域流展示状态。 */
  setStreamState: (state: AiWorkspaceStreamState) => void;
  /** 更新领域流错误。 */
  setStreamError: (error: string | null) => void;
  /** 更新 POST 直出流拥有的 Run 标识。 */
  setPostStreamRunId: (runId: string | null) => void;
  /** 以值或函数形式更新本地队列展示。 */
  updateLocalQueuedMessages: (updater: StateUpdater<AiWorkspaceQueuedMessage[]>) => void;
  /** 更新调整方向关联的旧 Run。 */
  setSteeringRunId: (runId: string | null) => void;
  /** 更新命令请求状态。 */
  setCommandState: (state: AiWorkspaceCommandState) => void;
  /** 更新命令请求错误。 */
  setCommandError: (error: string | null) => void;
  /** 递增路由请求版本并清空旧 Thread 的客户端投影。 */
  resetForRouteChange: () => number;
  /** 判断异步回调所属的路由请求是否仍然有效。 */
  isCurrentRequestVersion: (version: number) => boolean;
  /** 标记一个 Thread 开始或继续运行指定 Run。 */
  markThreadRunStarted: (threadId: string, runId: string) => void;
  /** 更新一个 Thread 的 Run 状态，并在终态时产生内存态完成提醒。 */
  markThreadRunStatus: (threadId: string, runId: string, status: AiRunStatus) => void;
  /** 清除指定 Thread 的内存态完成提醒，不改变正在运行状态。 */
  markThreadActivitySeen: (threadId: string) => void;
};

/** 解析支持函数写法的 Store 更新值。 */
function resolveStateUpdate<T>(current: T, updater: StateUpdater<T>): T {
  return typeof updater === 'function' ? (updater as (value: T) => T)(current) : updater;
}

/** 创建 AI 工作区的内存态 Store，不使用任何持久化中间件。 */
export const useAiThreadWorkspaceStore = create<AiThreadWorkspaceStore>((set, get) => ({
  threadState: EMPTY_THREAD_STATE,
  threadLoadState: 'IDLE',
  threadError: null,
  messageLoadState: 'IDLE',
  messageError: null,
  runEventState: null,
  streamState: 'IDLE',
  streamError: null,
  postStreamRunId: null,
  localQueuedMessages: [],
  steeringRunId: null,
  commandState: 'IDLE',
  commandError: null,
  requestVersion: 0,
  threadActivityById: {},
  updateThreadState: (updater) => set((state) => ({ threadState: resolveStateUpdate(state.threadState, updater) })),
  setThreadLoadState: (threadLoadState) => set({ threadLoadState }),
  setThreadError: (threadError) => set({ threadError }),
  setMessageLoadState: (messageLoadState) => set({ messageLoadState }),
  setMessageError: (messageError) => set({ messageError }),
  updateRunEventState: (updater) =>
    set((state) => ({ runEventState: resolveStateUpdate(state.runEventState, updater) })),
  setStreamState: (streamState) => set({ streamState }),
  setStreamError: (streamError) => set({ streamError }),
  setPostStreamRunId: (postStreamRunId) => set({ postStreamRunId }),
  updateLocalQueuedMessages: (updater) =>
    set((state) => ({ localQueuedMessages: resolveStateUpdate(state.localQueuedMessages, updater) })),
  setSteeringRunId: (steeringRunId) => set({ steeringRunId }),
  setCommandState: (commandState) => set({ commandState }),
  setCommandError: (commandError) => set({ commandError }),
  resetForRouteChange: () => {
    const requestVersion = get().requestVersion + 1;
    set({
      threadState: EMPTY_THREAD_STATE,
      threadLoadState: 'IDLE',
      threadError: null,
      messageLoadState: 'IDLE',
      messageError: null,
      runEventState: null,
      streamState: 'IDLE',
      streamError: null,
      postStreamRunId: null,
      localQueuedMessages: [],
      steeringRunId: null,
      commandState: 'IDLE',
      commandError: null,
      requestVersion,
    });
    return requestVersion;
  },
  isCurrentRequestVersion: (version) => get().requestVersion === version,
  markThreadRunStarted: (threadId, runId) =>
    set((state) => ({
      threadActivityById: {
        ...state.threadActivityById,
        [threadId]: {
          runId,
          status: 'RUNNING',
          isRunning: true,
          hasUnseenCompletion: false,
        },
      },
    })),
  markThreadRunStatus: (threadId, runId, status) =>
    set((state) => {
      const previous = state.threadActivityById[threadId];
      const isRunning =
        status === 'QUEUED' ||
        status === 'RUNNING' ||
        status === 'WAITING_APPROVAL' ||
        status === 'CANCELLATION_REQUESTED';
      if (previous?.runId && previous.runId !== runId && previous.isRunning) {
        return state;
      }

      return {
        threadActivityById: {
          ...state.threadActivityById,
          [threadId]: {
            runId,
            status,
            isRunning,
            hasUnseenCompletion: isRunning ? (previous?.runId === runId ? previous.hasUnseenCompletion : false) : true,
          },
        },
      };
    }),
  markThreadActivitySeen: (threadId) =>
    set((state) => {
      const previous = state.threadActivityById[threadId];
      if (!previous || !previous.hasUnseenCompletion) {
        return state;
      }

      return {
        threadActivityById: {
          ...state.threadActivityById,
          [threadId]: { ...previous, hasUnseenCompletion: false },
        },
      };
    }),
}));
