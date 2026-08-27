/**
 * 本文件定义 AI Thread POST 直出流的共享帧协议。
 *
 * 直出流只承载已经提交或已经持久化确认的结果；Thread、Message、Run 与
 * AiEvent 的领域语义仍由既有契约负责，恢复仍使用 GET SSE。
 */

import type { ApiErrorCode } from '../common/api-response.ts';
import type { AiEvent } from './ai-event.types.ts';
import type { AiMessageDispatchState, AiMessageSubmissionMode } from './ai-message.types.ts';
import type { AiRunCancellationReason, AiRunFailureReason, AiRunStatus } from './ai-run.types.ts';

/** POST 直出流允许出现的命名事件。 */
export const AI_POST_STREAM_EVENT_NAMES = [
  'submission',
  'ai-event',
  'run-status',
  'stream-handoff',
  'stream-error',
] as const;

/** POST 直出流命名事件名称。 */
export type AiPostStreamEventName = (typeof AI_POST_STREAM_EVENT_NAMES)[number];

/** POST 提交确认帧中的资源与投递元数据。 */
export type AiPostStreamSubmissionData = {
  /** 本次消息所属的 Thread 标识。新会话由此字段建立路由上下文。 */
  threadId: string;
  /** 本次新建或幂等重放得到的用户消息标识。 */
  messageId: string;
  /** 立即领取的 Run 标识；排队或已被替代时为 `null`。 */
  runId: string | null;
  /** 用户消息当前的持久化投递状态。 */
  dispatchState: AiMessageDispatchState;
  /** 服务端在 Thread 内分配的稳定队列序号。 */
  queueSequence: number;
  /** 本次提交采用的普通发送或调整方向模式。 */
  submissionMode: AiMessageSubmissionMode;
  /** 是否命中了相同幂等键的既有提交结果。 */
  replayed: boolean;
};

/** POST 直出流中的提交确认帧；一个请求最多发送一次且必须是第一个业务帧。 */
export type AiPostStreamSubmissionFrame = {
  /** SSE 命名事件名称。 */
  event: 'submission';
  /** 提交确认数据。 */
  data: AiPostStreamSubmissionData;
};

/** POST 直出流中的已提交领域事件帧。 */
export type AiPostStreamAiEventFrame = {
  /** SSE 命名事件名称。 */
  event: 'ai-event';
  /** 与 GET 恢复流使用同一份持久化领域事件。 */
  data: AiEvent;
};

/** POST 直出流中的 Run 状态确认快照。 */
export type AiPostStreamRunStatusData = {
  /** 当前 Run 标识。 */
  runId: string;
  /** 当前 Run 所属 Thread 标识。 */
  threadId: string;
  /** 服务端确认的 Run 状态。 */
  status: AiRunStatus;
  /** 取消路径的稳定原因；非取消路径为 `null`。 */
  cancellationReason: AiRunCancellationReason | null;
  /** 失败路径的稳定原因；非失败路径为 `null`。 */
  failureReason: AiRunFailureReason | null;
  /** 失败路径的稳定业务码；非失败路径为 `null`。 */
  failureCode: ApiErrorCode | null;
  /** 本帧确认的最后一个持久化领域事件序号。 */
  lastSequence: number;
};

/** POST 直出流中的 Run 状态帧；同一状态可因重连或批次确认重复出现。 */
export type AiPostStreamRunStatusFrame = {
  /** SSE 命名事件名称。 */
  event: 'run-status';
  /** Run 状态快照。 */
  data: AiPostStreamRunStatusData;
};

/** 直出流结束后交给 GET 恢复流使用的原因。 */
export type AiPostStreamHandoffReason =
  | 'POST_STREAM_COMPLETED'
  | 'LIVE_SINK_CLOSED'
  | 'RECOVERY_REQUIRED';

/** POST 直出流切换到 GET `afterSequence` 恢复流所需的游标结构。 */
export type AiPostStreamHandoffData = {
  /** 当前 Run 标识。 */
  runId: string;
  /** 当前 Run 所属 Thread 标识。 */
  threadId: string;
  /** 客户端已经确认的最后持久化事件序号。 */
  afterSequence: number;
  /** 当前直出流结束并需要恢复订阅的稳定原因。 */
  reason: AiPostStreamHandoffReason;
};

/** POST 直出流中的恢复提示帧；一个请求最多发送一次且必须是末尾业务帧。 */
export type AiPostStreamHandoffFrame = {
  /** SSE 命名事件名称。 */
  event: 'stream-handoff';
  /** GET 恢复流所需的游标结构。 */
  data: AiPostStreamHandoffData;
};

/** 响应头已经发送后无法再改成 HTTP JSON 外壳的稳定流错误。 */
export type AiPostStreamErrorData = {
  /** 调用方可以稳定分支判断的错误业务码。 */
  code: ApiErrorCode;
  /** 可安全展示给用户的错误说明。 */
  message: string;
  /** 贯穿服务端日志与本次响应的请求标识。 */
  requestId: string;
};

/** POST 直出流中的终端错误帧；发送后关闭当前流，不伪造 Run 终态。 */
export type AiPostStreamErrorFrame = {
  /** SSE 命名事件名称。 */
  event: 'stream-error';
  /** 稳定错误信息。 */
  data: AiPostStreamErrorData;
};

/** POST 直出流的完整可发送帧联合。 */
export type AiPostStreamFrame =
  | AiPostStreamSubmissionFrame
  | AiPostStreamAiEventFrame
  | AiPostStreamRunStatusFrame
  | AiPostStreamHandoffFrame
  | AiPostStreamErrorFrame;

/** 编解码器解析出的线协议帧；data 保留为未知值，由消费层按事件类型校验。 */
export type AiPostStreamWireFrame = {
  /** SSE 命名事件名称。 */
  event: AiPostStreamEventName;
  /** JSON 解码后的帧负载。 */
  data: unknown;
};
