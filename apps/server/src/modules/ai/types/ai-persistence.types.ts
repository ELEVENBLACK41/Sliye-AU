/**
 * 本文件定义第二阶段 AI 持久化服务内部使用的事务输入与返回类型。
 * 这些类型不属于浏览器 API 或共享 contracts，避免过早冻结尚未开放的服务端实现细节。
 */

import type {
  AiEventType,
  AiLanguageModelRole,
  AiRunCancellationReason,
  AiMessageDispatchState,
  AiMessageSubmissionMode,
  AiRunStatus,
} from '@workspace/contracts/ai';
import type { ApiErrorCode } from '@workspace/contracts/common';
import type { Prisma } from '../../../generated/prisma';
import type { AiToolSourceRef } from './ai-tool-source.types';

/** 原子创建 Thread、首条用户消息和首个 Run 的服务输入。 */
export type CreateAiThreadRunInput = {
  /** Thread 唯一拥有者的用户主键。 */
  ownerUserId: number;
  /** 首条非空用户消息。 */
  message: string;
  /** 当前用户创建 Thread 请求范围内的幂等键。 */
  idempotencyKey: string;
  /** 本次 Run 采用的逻辑语言模型角色。 */
  modelRole: AiLanguageModelRole;
};

/** 原子创建 Thread 后返回的三类稳定资源标识。 */
export type AiThreadRunCreationResult = {
  /** 新建或幂等重放得到的 Thread 标识。 */
  threadId: string;
  /** 新建或幂等重放得到的用户消息标识。 */
  messageId: string;
  /** 新建或幂等重放得到的 Run 标识。 */
  runId: string;
  /** 结果是否来自同一幂等键的既有资源。 */
  replayed: boolean;
};

/** 在已有 Thread 中创建用户消息和 Run 的服务输入。 */
export type CreateAiThreadMessageRunInput = {
  /** 当前操作用户，必须是 Thread 拥有者。 */
  ownerUserId: number;
  /** 消息要写入的 Thread 标识。 */
  threadId: string;
  /** 当前非空用户消息。 */
  message: string;
  /** Thread、用户和消息请求范围内的幂等键。 */
  idempotencyKey: string;
  /** 本次 Run 采用的逻辑语言模型角色。 */
  modelRole: AiLanguageModelRole;
  /** 普通输入顺序排队；调整方向替代尚未领取的旧输入。 */
  submissionMode?: AiMessageSubmissionMode;
};

/** 已持久化用户输入的投递结果；排队状态下不会关联新的 Run。 */
export type AiThreadMessageSubmissionResult = {
  /** 消息所属 Thread 标识。 */
  threadId: string;
  /** 新建或幂等重放得到的用户消息标识。 */
  messageId: string;
  /** 当前消息已被领取时关联的新 Run；仍在队列或已被替代时为 `null`。 */
  runId: string | null;
  /** 当前消息的持久化投递状态。 */
  dispatchState: AiMessageDispatchState;
  /** 当前消息在 Thread 内的稳定队列顺序。 */
  queueSequence: number;
  /** 本次消息使用的提交模式。 */
  submissionMode: AiMessageSubmissionMode;
  /** 结果是否来自同一幂等键的既有消息。 */
  replayed: boolean;
};

/** 从一个已结束 Run 创建重试 Run 的服务输入。 */
export type RetryAiRunInput = {
  /** 当前操作用户，必须是旧 Run 所属 Thread 的拥有者。 */
  ownerUserId: number;
  /** 被重试的旧 Run 标识。 */
  runId: string;
  /** 旧 Run、用户和重试请求范围内的幂等键。 */
  idempotencyKey: string;
};

/** 将 Run 收敛到终态时使用的内部事务输入。 */
export type CompleteAiRunInput = {
  /** 当前操作用户，必须是 Run 所属 Thread 的拥有者。 */
  ownerUserId: number;
  /** 要收敛的 Run 标识。 */
  runId: string;
  /** 只有持有当前有效执行租约的执行器可以收敛成功或失败终态。 */
  executionLeaseId: string;
  /** 目标终态；用户取消必须先进入取消请求再单独确认。 */
  status: Extract<AiRunStatus, 'COMPLETED' | 'FAILED'>;
  /** 失败路径的稳定原因；非失败终态传入 `null`。 */
  failureReason: string | null;
  /** 失败路径的稳定业务错误码；非失败终态传入 `null`。 */
  failureCode: ApiErrorCode | null;
  /**
   * 助手最终回答正文；与终态在同一事务写入，避免出现"消息已完成但 Run 失败"的中间态。
   * 没有生成正文（例如模型失败）时传入 `null` 或省略。
   */
  assistantMessageContent?: string | null;
};

/** 用户请求停止当前 Run 的服务端输入；该操作不会直接向模型流注入新的文本。 */
export type RequestAiRunStopInput = {
  /** 当前操作用户，必须是 Run 所属 Thread 的拥有者。 */
  ownerUserId: number;
  /** 当前用户希望停止的 Run 标识。 */
  runId: string;
  /** 用户主动停止或调整方向触发的稳定取消原因。 */
  cancellationReason: Extract<
    AiRunCancellationReason,
    'USER_REQUESTED' | 'USER_REDIRECTED'
  >;
};

/** 取消请求或确认取消后返回的当前 Run 状态。 */
export type AiRunStopResult = {
  /** 被处理的 Run 标识。 */
  runId: string;
  /** 事务完成后的最新 Run 状态。 */
  status: Extract<
    AiRunStatus,
    'CANCELLATION_REQUESTED' | 'CANCELLED' | 'COMPLETED' | 'FAILED'
  >;
  /** 旧 Run 已终态后由队列领取的下一条用户消息对应 Run；没有则为 null。 */
  nextRunId: string | null;
};

/** 追加一条已冻结负载结构的 AI 流事件时使用的内部输入。 */
export type AppendAiEventInput = {
  /** 事件归属的 Run 标识。 */
  runId: string;
  /** 当前已冻结的事件类型。 */
  type: AiEventType;
  /** 可安全落库的结构化事件负载。 */
  data: Prisma.InputJsonValue;
};

/** 执行器记录一次模型步骤时使用的内部输入；序号由持有租约的唯一执行器自行递增。 */
export type RecordAiStepInput = {
  /** 步骤归属的 Run 标识。 */
  runId: string;
  /** 只有持有当前有效执行租约的执行器可以写入步骤。 */
  executionLeaseId: string;
  /** Run 内从 1 开始且严格递增的模型步骤序号。 */
  sequence: number;
  /** Gateway 实际执行本步骤的供应商模型标识；未取得时为 `null`。 */
  resolvedModelId: string | null;
  /** 模型步骤结束原因；未取得时为 `null`。 */
  finishReason: string | null;
  /** 本步骤输入 Token 数；供应商未返回时为 `null`。 */
  inputTokens: number | null;
  /** 本步骤输出 Token 数；供应商未返回时为 `null`。 */
  outputTokens: number | null;
  /** 本步骤 Token 总数；供应商未返回时为 `null`。 */
  totalTokens: number | null;
  /** 本步骤开始时间。 */
  startedAt: Date;
  /** 本步骤结束时间。 */
  finishedAt: Date;
  /** 本步骤内由模型生成、需要关联到该步骤的工具调用标识。 */
  providerToolCallIds: string[];
};

/** 执行器发起一次只读工具调用时使用的内部输入。 */
export type StartAiToolCallInput = {
  /** 工具调用归属的 Run 标识。 */
  runId: string;
  /** 只有持有当前有效执行租约的执行器可以发起工具调用。 */
  executionLeaseId: string;
  /** 模型侧生成的工具调用标识，用于幂等重放和与模型消息对齐。 */
  providerToolCallId: string;
  /** 中心工具注册表中的稳定工具名称。 */
  toolName: string;
  /** 工具窄输入的受控快照。 */
  input: Prisma.InputJsonValue;
};

/** 执行器结束一次只读工具调用时使用的内部输入。 */
export type SettleAiToolCallInput = {
  /** 工具调用归属的 Run 标识。 */
  runId: string;
  /** 只有持有当前有效执行租约的执行器可以结束工具调用。 */
  executionLeaseId: string;
  /** 已持久化的工具调用标识。 */
  toolCallId: string;
  /** 工具调用的最终状态。 */
  status: 'SUCCEEDED' | 'FAILED';
  /** 成功时的工具窄输出受控摘要；失败时为 `null`。 */
  outputSummary: Prisma.InputJsonValue | null;
  /** 失败时的稳定业务错误码；成功时为 `null`。 */
  failureCode: ApiErrorCode | null;
  /** 失败时的稳定原因说明；成功时为 `null`。 */
  failureReason: string | null;
  /** 本次调用实际读取的业务来源；失败时通常为空数组。 */
  sources: readonly AiToolSourceRef[];
  /** 工具执行耗时，单位毫秒。 */
  durationMs: number;
};

/** 执行器写入最终助手消息并把 Run 收敛为完成终态时使用的内部输入。 */
export type FinishAiAssistantMessageInput = {
  /** 助手消息归属的 Run 标识。 */
  runId: string;
  /** 只有持有当前有效执行租约的执行器可以写入最终助手消息。 */
  executionLeaseId: string;
  /** 助手最终回答正文。 */
  content: string;
};
