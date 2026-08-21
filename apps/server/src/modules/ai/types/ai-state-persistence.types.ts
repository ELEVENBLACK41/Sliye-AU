/**
 * 本文件定义 AI 状态持久化服务的后端内部命令和结果类型。
 * 这些类型不直接作为 HTTP 契约，避免在 2.5 接口设计前暴露内部事务字段。
 */

import type {
  AiAssistantTextDeltaEvent,
  AiEvent,
  AiLanguageModelRole,
  AiMessage,
  AiRun,
  AiRunStatusChangedEvent,
  AiThread,
} from '@workspace/contracts/ai';
import type { AuthorizationContext } from '../../auth/types/auth.types';

/** 原子创建 Decision AI Thread、首条用户消息和首个 Run 的命令。 */
export type CreateInitialAiRunCommand = {
  /** 当前请求实时计算出的认证与授权上下文。 */
  authorization: AuthorizationContext;
  /** 第一版 Thread 唯一绑定的决策主键。 */
  decisionId: number;
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
export type AiRunCreationResult = {
  /** 创建或幂等重放命中的 Thread。 */
  thread: AiThread;
  /** 创建或幂等重放命中的用户消息。 */
  message: AiMessage;
  /** 创建或幂等重放命中的 Run。 */
  run: AiRun;
  /** 当前结果是否来自已存在的幂等记录。 */
  replayed: boolean;
};

/** 追加 Run 状态变化事件的命令。 */
export type AppendAiRunStatusEventCommand = {
  /** 事件所属 Run UUID。 */
  runId: string;
  /** 供消费者执行联合类型收窄的事件类型。 */
  type: 'RUN_STATUS_CHANGED';
  /** 已通过状态机校验的状态变化负载。 */
  data: AiRunStatusChangedEvent['data'];
};

/** 追加助手文本增量事件的命令。 */
export type AppendAiTextDeltaEventCommand = {
  /** 事件所属 Run UUID。 */
  runId: string;
  /** 供消费者执行联合类型收窄的事件类型。 */
  type: 'ASSISTANT_TEXT_DELTA';
  /** 需要按事件序号追加的消息和文本增量。 */
  data: AiAssistantTextDeltaEvent['data'];
};

/** 当前事件持久化服务允许追加的命令联合。 */
export type AppendAiEventCommand =
  | AppendAiRunStatusEventCommand
  | AppendAiTextDeltaEventCommand;

/** 持久化一次独立语言模型调用及用量快照的命令。 */
export type RecordAiModelStepCommand = {
  /** 模型调用所属 Run UUID。 */
  runId: string;
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
