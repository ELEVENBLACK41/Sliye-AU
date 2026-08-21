/**
 * 本文件定义第 2.4 阶段浏览器、BFF Agent Runtime 与 NestJS 之间的共享执行契约。
 * 执行租约只允许在服务端链路中传递，浏览器响应不得包含 fencing token。
 */

import type { ApiErrorCode } from '../common/api-response.ts';
import type { AiEvent } from './ai-event.types.ts';
import type { AiMessage } from './ai-message.types.ts';
import type { AiLanguageModelRole } from './ai-model.types.ts';
import type { AiRun, AiRunFailureReason } from './ai-run.types.ts';
import type { AiThread } from './ai-thread.types.ts';
import type { GetDecisionContextToolInput, GetDecisionContextToolResultSummary } from './ai-tool.types.ts';

/** 创建绑定单项决策的 AI Thread 与首个 Run 的请求。 */
export type CreateAiThreadRunRequest = {
  /** 第一版 Thread 唯一绑定的决策主键。 */
  decisionId: number;
  /** 用户提交并需要持久化的首条消息。 */
  content: string;
  /** 浏览器生成的 UUID 幂等键。 */
  clientRequestId: string;
  /** 本次执行请求的逻辑模型角色；省略时使用标准模型。 */
  modelRole?: AiLanguageModelRole;
};

/** 在既有 Thread 内创建用户消息和 Run 的请求。 */
export type CreateAiThreadMessageRunRequest = {
  /** 用户提交并需要持久化的新消息。 */
  content: string;
  /** 浏览器生成的 UUID 幂等键。 */
  clientRequestId: string;
  /** 本次执行请求的逻辑模型角色；省略时使用标准模型。 */
  modelRole?: AiLanguageModelRole;
};

/** 从失败或取消 Run 创建新 Run 的请求。 */
export type RetryAiRunRequest = {
  /** 浏览器生成的 UUID 幂等键。 */
  clientRequestId: string;
};

/** 一次消息提交或重试得到的完整持久化状态快照。 */
export type AiRunCreation = {
  /** 创建或幂等重放命中的 Thread。 */
  thread: AiThread;
  /** 创建或幂等重放命中的用户消息。 */
  message: AiMessage;
  /** 创建或幂等重放命中的 Run。 */
  run: AiRun;
  /** 当前结果是否来自已存在的幂等记录。 */
  replayed: boolean;
};

/** 首个 UI 流事件返回的公开运行定位信息。 */
export type AiRunStreamMetadata = {
  /** 当前 Thread UUID。 */
  threadId: string;
  /** 触发当前 Run 的用户消息 UUID。 */
  messageId: string;
  /** 当前 Run UUID。 */
  runId: string;
  /** 当前请求是否命中幂等重放。 */
  replayed: boolean;
};

/** NestJS 事件补拉接口返回的当前状态和事件页。 */
export type AiRunEventPage = {
  /** 已重新鉴权的 Thread UUID。 */
  threadId: string;
  /** 指定 Run 的最新状态快照。 */
  run: AiRun;
  /** 严格按 sequence 升序返回的增量事件。 */
  events: AiEvent[];
  /** 本页最后一个事件序号；没有事件时等于请求的 afterSequence。 */
  lastSequence: number;
};

/** BFF 执行器领取排队 Run 的内部请求。 */
export type ClaimAiRunExecutionRequest = {
  /** 当前执行器承诺在此时间内续租的毫秒数。 */
  leaseDurationMs: number;
};

/** BFF 执行器领取或续租成功后的内部结果。 */
export type AiRunExecutionLease = {
  /** 已进入运行态或完成续租的 Run。 */
  run: AiRun;
  /** 后续每次执行写入必须携带的 fencing UUID。 */
  executionLeaseId: string;
};

/** BFF 执行器续租当前 Run 的内部请求。 */
export type RenewAiRunExecutionRequest = {
  /** 领取时签发且不能由旧执行器替代的 fencing UUID。 */
  executionLeaseId: string;
  /** 从本次续租时间起延长的毫秒数。 */
  leaseDurationMs: number;
};

/** BFF 执行器追加助手文本增量的内部请求。 */
export type AppendAiTextDeltaRequest = {
  /** 当前有效的执行租约 UUID。 */
  executionLeaseId: string;
  /** 当前流式助手消息的稳定 UUID。 */
  messageId: string;
  /** 本次非空文本增量。 */
  delta: string;
};

/** BFF 执行器持久化一次模型调用的内部请求。 */
export type RecordAiModelStepRequest = {
  /** 当前有效的执行租约 UUID。 */
  executionLeaseId: string;
  /** Run 内从 1 开始的模型调用序号。 */
  sequence: number;
  /** 本次调用承担的逻辑模型角色。 */
  modelRole: AiLanguageModelRole;
  /** Gateway 实际执行的模型 ID。 */
  resolvedModelId: string;
  /** AI SDK 返回的提供商名称。 */
  provider: string;
  /** 提供商响应 ID；未提供时为空。 */
  responseId: string | null;
  /** AI SDK 返回的停止原因。 */
  finishReason: string;
  /** 本次调用的输入 Token 数。 */
  inputTokens: number;
  /** 本次调用的输出 Token 数。 */
  outputTokens: number;
  /** 根据调用时价格快照估算的美元成本。 */
  estimatedCostUsd: number;
  /** 模型调用开始时间，使用 ISO 8601 字符串。 */
  startedAt: string;
  /** 模型调用结束时间，使用 ISO 8601 字符串。 */
  finishedAt: string;
  /** 首个输出耗时；无法取得时为空。 */
  timeToFirstOutputMs: number | null;
};

/** BFF 执行器写入成功终态与助手最终消息的内部请求。 */
export type CompleteAiRunExecutionRequest = {
  /** 当前有效的执行租约 UUID。 */
  executionLeaseId: string;
  /** 流式阶段预先分配的助手消息 UUID。 */
  assistantMessageId: string;
  /** 需要固化为历史消息的完整助手正文。 */
  assistantContent: string;
  /** Gateway 最终实际执行的模型 ID。 */
  resolvedModelId: string;
};

/** BFF 执行器写入失败终态的内部请求。 */
export type FailAiRunExecutionRequest = {
  /** 当前有效的执行租约 UUID。 */
  executionLeaseId: string;
  /** 可稳定统计的失败原因。 */
  failureReason: AiRunFailureReason;
  /** 供调用方稳定分支判断的业务错误码。 */
  failureCode: ApiErrorCode;
};

/** BFF 执行器确认取消已生效的内部请求。 */
export type ConfirmAiRunCancellationRequest = {
  /** 当前有效的执行租约 UUID。 */
  executionLeaseId: string;
};

/** BFF 执行器在工具执行前创建审计记录的内部请求。 */
export type StartAiToolCallRequest = {
  /** 当前有效的执行租约 UUID。 */
  executionLeaseId: string;
  /** AI SDK 生成的工具调用 ID。 */
  toolCallId: string;
  /** Run 内从 1 开始的工具调用序号。 */
  sequence: number;
  /** 当前唯一开放的真实工具。 */
  toolName: 'getDecisionContext';
  /** 已经过 Zod 校验的安全工具输入。 */
  input: GetDecisionContextToolInput;
};

/** BFF 执行器在工具结束后完成审计记录的内部请求。 */
export type FinishAiToolCallRequest = {
  /** 当前有效的执行租约 UUID。 */
  executionLeaseId: string;
  /** AI SDK 生成的工具调用 ID。 */
  toolCallId: string;
  /** 成功时为受控结果摘要，失败时为空。 */
  resultSummary: GetDecisionContextToolResultSummary | null;
  /** 失败时的稳定错误码，成功时为空。 */
  errorCode: string | null;
  /** AI SDK 测得的完整工具执行耗时。 */
  durationMs: number;
};

/** `getDecisionContext` 工具返回的稳定业务来源引用。 */
export type AiDecisionContextSource = {
  /** 后续引用和来源依赖登记使用的稳定来源 ID。 */
  sourceId: string;
  /** 当前来源固定为决策记录。 */
  sourceType: 'DECISION';
  /** 面向模型和 UI 的短标题。 */
  title: string;
};

/** 唯一真实只读工具返回的受权限保护决策基础上下文。 */
export type AiDecisionContext = {
  /** 决策基础字段。 */
  decision: {
    /** 决策主键。 */
    id: number;
    /** 决策标题。 */
    title: string;
    /** 决策说明；未填写时为空。 */
    description: string | null;
    /** 当前决策领域状态。 */
    status: string;
    /** 当前显式参与人数。 */
    participantCount: number;
    /** 决策创建时间，使用 ISO 8601 字符串。 */
    createdAt: string;
    /** 决策最后更新时间，使用 ISO 8601 字符串。 */
    updatedAt: string;
  };
  /** 决策所属项目。 */
  project: {
    /** 项目主键。 */
    id: number;
    /** 项目标题。 */
    title: string;
  };
  /** 决策所属讨论区域；项目级决策为空。 */
  area: {
    /** 区域主键。 */
    id: number;
    /** 区域名称。 */
    name: string;
    /** 区域公开性类型。 */
    type: string;
  } | null;
  /** 决策业务责任部门。 */
  department: {
    /** 部门主键。 */
    id: number;
    /** 稳定部门代码。 */
    code: string;
    /** 部门名称。 */
    name: string;
  };
  /** 工具实际读取并允许后续引用的稳定来源。 */
  sources: AiDecisionContextSource[];
};
