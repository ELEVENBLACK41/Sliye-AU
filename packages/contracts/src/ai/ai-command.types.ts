/**
 * 本文件定义浏览器侧 AI Thread 命令接口的共享请求与响应契约。
 * 这里只描述 REST 可序列化的数据，不包含请求函数、权限判断或运行实现。
 */

import type { AiMessageDispatchState, AiMessageSubmissionMode } from './ai-message.types.ts';
import type { AiRunStatus } from './ai-run.types.ts';

/** 在既有 Thread 中提交用户消息的请求体。 */
export type CreateAiThreadMessageRequest = {
  /** 当前用户要持久化的非空消息正文。 */
  message: string;
  /** 当前提交请求使用的稳定幂等键。 */
  idempotencyKey: string;
  /** 普通发送或调整方向；活跃 Run 期间普通发送会被服务端拒绝。 */
  submissionMode?: AiMessageSubmissionMode;
};

/** 从已结束 Run 创建重试 Run 时使用的请求体。 */
export type RetryAiRunRequest = {
  /** 当前重试请求使用的稳定幂等键。 */
  idempotencyKey: string;
};

/** 在既有 Thread 中提交消息后的真实投递结果。 */
export type AiThreadMessageSubmissionResult = {
  /** 消息所属 Thread 标识。 */
  threadId: string;
  /** 新建或幂等重放得到的用户消息标识。 */
  messageId: string;
  /** 已立即领取消息对应的 Run；历史排队或调整方向结果可能为空。 */
  runId: string | null;
  /** 当前消息的持久化投递状态。 */
  dispatchState: AiMessageDispatchState;
  /** 当前消息在 Thread 内的稳定队列序号。 */
  queueSequence: number;
  /** 本次消息使用的提交模式。 */
  submissionMode: AiMessageSubmissionMode;
  /** 结果是否来自同一幂等键的既有消息。 */
  replayed: boolean;
};

/** 创建或重试 Run 后返回的真实资源标识。 */
export type AiThreadRunCommandResult = {
  /** Run 所属 Thread 标识。 */
  threadId: string;
  /** 本次 Run 对应的用户消息标识。 */
  messageId: string;
  /** 新建或幂等重放得到的 Run 标识。 */
  runId: string;
  /** 结果是否来自同一幂等键的既有 Run。 */
  replayed: boolean;
};

/** 停止 Run 后返回的真实状态与可能已领取的后继 Run。 */
export type AiRunControlResult = {
  /** 被操作的 Run 标识。 */
  runId: string;
  /** 操作完成时服务端确认的 Run 状态。 */
  status: AiRunStatus;
  /** 同一 Thread 中被领取的下一条 Run；没有则为空。 */
  nextRunId: string | null;
};
