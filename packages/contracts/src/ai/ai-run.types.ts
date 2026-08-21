/**
 * 本文件定义一次 AI 响应运行的共享状态、终止原因、用量和审计契约。
 * Run 进入终态后不可恢复运行；重试必须创建关联原 Run 的新记录。
 */

import type { ApiErrorCode } from '../common/api-response.ts';
import type { AiLanguageModelRole } from './ai-model.types.ts';

/** AI Run 状态机支持的全部稳定状态。 */
export const AI_RUN_STATUSES = [
  'QUEUED',
  'RUNNING',
  'WAITING_APPROVAL',
  'CANCELLATION_REQUESTED',
  'CANCELLED',
  'COMPLETED',
  'FAILED',
] as const;

/** AI Run 当前生命周期状态。 */
export type AiRunStatus = (typeof AI_RUN_STATUSES)[number];

/** 仍可能发生合法状态转换并占用 Thread 单 Run 门禁的状态。 */
export type AiRunNonTerminalStatus = Extract<
  AiRunStatus,
  'QUEUED' | 'RUNNING' | 'WAITING_APPROVAL' | 'CANCELLATION_REQUESTED'
>;

/** 不再允许发生任何状态转换的 Run 终态。 */
export type AiRunTerminalStatus = Extract<AiRunStatus, 'CANCELLED' | 'COMPLETED' | 'FAILED'>;

/** 第一版 Run 被取消时保存的稳定原因。 */
export type AiRunCancellationReason = 'USER_REQUESTED' | 'SCOPE_CHANGED';

/** 第一版 Run 失败时保存的稳定原因。 */
export type AiRunFailureReason = 'MODEL_ERROR' | 'TOOL_ERROR' | 'EXECUTION_LEASE_EXPIRED' | 'INTERNAL_ERROR';

/** 一次 Run 聚合后的模型 Token 和静态成本快照。 */
export type AiRunUsage = {
  /** 模型调用累计输入 Token 数。 */
  inputTokens: number;
  /** 模型调用累计输出 Token 数。 */
  outputTokens: number;
  /** 输入与输出 Token 的累计总数。 */
  totalTokens: number;
  /** 根据运行当时价格快照估算的美元成本；无法估算时为 `null`。 */
  estimatedCostUsd: number | null;
};

/** 一次针对用户消息执行的可审计 AI 运行。 */
export type AiRun = {
  /** 对外稳定的 Run 标识。 */
  id: string;
  /** Run 所属 Thread 标识。 */
  threadId: string;
  /** 本次执行回答的原始用户消息标识；重试继续引用同一消息。 */
  userMessageId: string;
  /** 被本次重试替代的旧 Run 标识；首次执行时为 `null`。 */
  retryOfRunId: string | null;
  /** Run 当前生命周期状态。 */
  status: AiRunStatus;
  /** 本次运行请求的逻辑语言模型角色。 */
  modelRole: AiLanguageModelRole;
  /** Gateway 最终实际执行的供应商模型标识；尚未调用模型时为 `null`。 */
  resolvedModelId: string | null;
  /** 当前执行器持有的租约标识；尚未领取或租约失效时为 `null`。 */
  executionLeaseId: string | null;
  /** 当前执行租约过期时间；没有有效租约时为 `null`。 */
  executionLeaseExpiresAt: string | null;
  /** 取消终态或取消请求对应的稳定原因；其他状态为 `null`。 */
  cancellationReason: AiRunCancellationReason | null;
  /** 失败终态对应的稳定原因；其他状态为 `null`。 */
  failureReason: AiRunFailureReason | null;
  /** 失败时可供调用方稳定分支判断的业务错误码；非失败状态为 `null`。 */
  failureCode: ApiErrorCode | null;
  /** Run 完成后聚合的模型用量；执行结束前或未调用模型时为 `null`。 */
  usage: AiRunUsage | null;
  /** Run 首次进入 `RUNNING` 的时间；尚未领取时为 `null`。 */
  startedAt: string | null;
  /** Run 进入任一终态的时间；非终态时为 `null`。 */
  finishedAt: string | null;
  /** Run 创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
  /** Run 最后一次状态或审计字段变化时间，使用 ISO 8601 字符串。 */
  updatedAt: string;
};
