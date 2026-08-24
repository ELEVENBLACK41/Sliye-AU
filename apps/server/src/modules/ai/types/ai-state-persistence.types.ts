/**
 * 本文件定义 AI 状态持久化服务的后端内部命令和结果类型。
 * 这些类型不直接作为 HTTP 契约，避免在 2.5 接口设计前暴露内部事务字段。
 */

import type {
  AiAssistantTextDeltaEvent,
  AiEvent,
  AiLanguageModelRole,
  AiRun,
  AiRunCreation,
  AiRunFailureReason,
  AiToolCall,
  FinishAiToolCallRequest,
  StartAiToolCallRequest,
} from '@workspace/contracts/ai';
import type { ApiErrorCode } from '@workspace/contracts/common';
import type { AuthorizationContext } from '../../auth/types/auth.types';

/** 原子创建 Decision AI Thread、首条用户消息和首个 Run 的命令。 */
export type CreateInitialAiRunCommand = {
  /** 当前请求实时计算出的认证与授权上下文。 */
  authorization: AuthorizationContext;
  /** 2.6 兼容调用可提供的精确决策主键；新流程允许省略。 */
  decisionId?: number;
  /** 用户提交并需要持久化的首条问题。 */
  content: string;
  /** 浏览器为本次业务操作生成的 UUID 幂等键。 */
  clientRequestId: string;
  /** 本次 Run 请求的逻辑语言模型角色。 */
  modelRole: AiLanguageModelRole;
};

/** 在已有 Thread 中原子创建用户消息和新 Run 的命令。 */
export type CreateThreadMessageRunCommand = {
  /** 当前请求实时计算出的认证与授权上下文。 */
  authorization: AuthorizationContext;
  /** 需要继续提问的 Thread UUID。 */
  threadId: string;
  /** 用户提交并需要持久化的新问题。 */
  content: string;
  /** 浏览器为本次业务操作生成的 UUID 幂等键。 */
  clientRequestId: string;
  /** 本次 Run 请求的逻辑语言模型角色。 */
  modelRole: AiLanguageModelRole;
};

/** 一次原子消息提交返回的 Thread、Message 和 Run 快照。 */
export type AiRunCreationResult = AiRunCreation;

/** 原子领取排队中 Run 并签发执行租约的命令。 */
export type ClaimAiRunCommand = {
  /** 当前执行请求携带且需要重新复核的用户授权上下文。 */
  authorization: AuthorizationContext;
  /** 需要由当前执行器领取的 Run UUID。 */
  runId: string;
  /** 当前执行器承诺续租前的租约有效毫秒数。 */
  leaseDurationMs: number;
};

/** 成功领取或续租后返回的执行租约快照。 */
export type AiRunLeaseResult = {
  /** 已进入运行态的 Run。 */
  run: AiRun;
  /** 后续所有执行写入必须携带的 fencing UUID。 */
  executionLeaseId: string;
};

/** 续租当前执行租约的命令。 */
export type RenewAiRunLeaseCommand = {
  /** 当前执行请求携带且需要重新复核的用户授权上下文。 */
  authorization: AuthorizationContext;
  /** 当前执行中的 Run UUID。 */
  runId: string;
  /** 领取时签发且不能被其他执行器替代的租约 UUID。 */
  executionLeaseId: string;
  /** 从本次续租时间起延长的租约有效毫秒数。 */
  leaseDurationMs: number;
};

/** 用户请求停止一次排队中或执行中的 Run。 */
export type RequestAiRunCancellationCommand = {
  /** 当前请求实时计算出的认证与授权上下文。 */
  authorization: AuthorizationContext;
  /** 需要停止的 Run UUID。 */
  runId: string;
};

/** 执行器确认取消已经生效并写入唯一取消终态的命令。 */
export type ConfirmAiRunCancellationCommand = {
  /** 当前执行请求携带且需要重新复核的用户授权上下文。 */
  authorization: AuthorizationContext;
  /** 当前执行中的 Run UUID。 */
  runId: string;
  /** 必须与数据库当前租约匹配的 fencing UUID。 */
  executionLeaseId: string;
};

/** 执行器写入助手最终消息并完成 Run 的命令。 */
export type CompleteAiRunCommand = {
  /** 当前执行请求携带且需要重新复核的用户授权上下文。 */
  authorization: AuthorizationContext;
  /** 当前执行中的 Run UUID。 */
  runId: string;
  /** 必须与数据库当前租约匹配的 fencing UUID。 */
  executionLeaseId: string;
  /** 流式阶段预先分配并最终固化的助手消息 UUID。 */
  assistantMessageId: string;
  /** 已完成且需要作为历史消息保存的助手正文。 */
  assistantContent: string;
  /** Gateway 最终实际执行的供应商模型 ID。 */
  resolvedModelId: string;
  /** 助手最终回答实际引用的稳定来源 ID。 */
  sourceIds: string[];
};

/** 执行器把当前 Run 收敛为失败终态的命令。 */
export type FailAiRunCommand = {
  /** 当前执行请求携带且需要重新复核的用户授权上下文。 */
  authorization: AuthorizationContext;
  /** 当前执行中的 Run UUID。 */
  runId: string;
  /** 必须与数据库当前租约匹配的 fencing UUID。 */
  executionLeaseId: string;
  /** 可稳定统计的失败原因。 */
  failureReason: AiRunFailureReason;
  /** 暴露给调用方做稳定分支判断的业务错误码。 */
  failureCode: ApiErrorCode;
};

/** 对账过期执行租约时使用的受控批次命令。 */
export type ReconcileExpiredAiRunsCommand = {
  /** 对账基准时间；生产调用通常传当前时间，测试可固定。 */
  now: Date;
  /** 单批最多处理的 Run 数，避免一次事务范围无限增长。 */
  batchSize: number;
};

/** 一次过期租约对账的确定性结果。 */
export type ReconcileExpiredAiRunsResult = {
  /** 本批真正从非终态收敛为失败的 Run UUID。 */
  reconciledRunIds: string[];
};

/** 对失败或取消 Run 创建新 Run 的幂等重试命令。 */
export type RetryAiRunCommand = {
  /** 当前请求实时计算出的认证与授权上下文。 */
  authorization: AuthorizationContext;
  /** 只能指向失败或取消终态的旧 Run UUID。 */
  runId: string;
  /** 浏览器为本次重试业务操作生成的 UUID 幂等键。 */
  clientRequestId: string;
};

/** 追加助手文本增量事件的命令。 */
export type AppendAiTextDeltaEventCommand = {
  /** 当前执行请求携带且需要重新复核的用户授权上下文。 */
  authorization: AuthorizationContext;
  /** 事件所属 Run UUID。 */
  runId: string;
  /** 必须与 Run 当前执行租约匹配的 fencing UUID。 */
  executionLeaseId: string;
  /** 供消费者执行联合类型收窄的事件类型。 */
  type: 'ASSISTANT_TEXT_DELTA';
  /** 需要按事件序号追加的消息和文本增量。 */
  data: AiAssistantTextDeltaEvent['data'];
};

/** 当前事件持久化服务只接收运行中的助手文本；状态事件由状态事务内部写入。 */
export type AppendAiEventCommand = AppendAiTextDeltaEventCommand;

/** 持久化一次独立语言模型调用及用量快照的命令。 */
export type RecordAiModelStepCommand = {
  /** 当前执行请求携带且需要重新复核的用户授权上下文。 */
  authorization: AuthorizationContext;
  /** 模型调用所属 Run UUID。 */
  runId: string;
  /** 必须与 Run 当前执行租约匹配的 fencing UUID。 */
  executionLeaseId: string;
  /** Run 内从 1 开始的模型 Step 序号。 */
  sequence: number;
  /** 本次模型调用承担的逻辑角色。 */
  modelRole: AiLanguageModelRole;
  /** Gateway 最终实际执行的供应商模型 ID。 */
  resolvedModelId: string;
  /** AI SDK 返回的实际提供商名称。 */
  provider: string;
  /** 提供商返回的响应标识；未提供时为空。 */
  responseId: string | null;
  /** AI SDK 返回的停止原因。 */
  finishReason: string;
  /** 本次调用的输入 Token 数。 */
  inputTokens: number;
  /** 本次调用的输出 Token 数。 */
  outputTokens: number;
  /** 根据调用时价格快照估算的美元成本。 */
  estimatedCostUsd: number;
  /** 模型调用开始时间。 */
  startedAt: Date;
  /** 模型调用完成时间。 */
  finishedAt: Date;
  /** 从调用开始到首个输出的毫秒数；无法取得时为空。 */
  timeToFirstOutputMs: number | null;
};

/** 已持久化的一次语言模型 Step 快照。 */
export type AiModelStepRecord = {
  /** Step UUID。 */
  id: string;
  /** Step 所属 Run UUID。 */
  runId: string;
  /** Run 内模型 Step 序号。 */
  sequence: number;
  /** 本次调用的逻辑模型角色。 */
  modelRole: AiLanguageModelRole;
  /** 实际模型 ID。 */
  resolvedModelId: string;
  /** 实际提供商。 */
  provider: string;
  /** 提供商响应标识。 */
  responseId: string | null;
  /** 模型停止原因。 */
  finishReason: string;
  /** 输入 Token 数。 */
  inputTokens: number;
  /** 输出 Token 数。 */
  outputTokens: number;
  /** 输入和输出 Token 总数。 */
  totalTokens: number;
  /** 调用成本估算。 */
  estimatedCostUsd: number;
  /** 调用开始时间。 */
  startedAt: string;
  /** 调用结束时间。 */
  finishedAt: string;
  /** 完整调用耗时。 */
  durationMs: number;
  /** 首个输出耗时。 */
  timeToFirstOutputMs: number | null;
  /** Step 入库时间。 */
  createdAt: string;
};

/** 事件追加服务返回的共享事件联合。 */
export type AppendAiEventResult = AiEvent;

/** 创建工具调用审计记录的内部命令。 */
export type StartAiToolCallCommand = StartAiToolCallRequest & {
  /** 当前执行请求携带且需要重新复核的用户授权上下文。 */
  authorization: AuthorizationContext;
  /** 工具调用所属 Run UUID。 */
  runId: string;
};

/** 完成工具调用审计记录的内部命令。 */
export type FinishAiToolCallCommand = FinishAiToolCallRequest & {
  /** 当前执行请求携带且需要重新复核的用户授权上下文。 */
  authorization: AuthorizationContext;
  /** 工具调用所属 Run UUID。 */
  runId: string;
};

/** 工具调用持久化服务返回的共享审计快照。 */
export type AiToolCallRecord = AiToolCall;
