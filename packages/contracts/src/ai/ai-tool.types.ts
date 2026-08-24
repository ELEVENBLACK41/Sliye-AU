/**
 * 本文件定义 AI 工具注册元数据与每次真实工具调用的审计契约。
 */

/** 第 2.4 阶段允许持久化的工具调用状态。 */
export const AI_TOOL_CALL_STATUSES = ['WAITING', 'RUNNING', 'COMPLETED', 'FAILED'] as const;

/** 一次工具调用的当前审计状态。 */
export type AiToolCallStatus = (typeof AI_TOOL_CALL_STATUSES)[number];

/** Thread 来源依赖的两种稳定登记用途。 */
export const AI_SOURCE_DEPENDENCY_USAGES = ['TOOL_READ', 'ANSWER_CITATION'] as const;

/** 来源由真实工具读取或由助手最终回答引用。 */
export type AiSourceDependencyUsage = (typeof AI_SOURCE_DEPENDENCY_USAGES)[number];

/** 当前唯一开放的真实只读工具名称。 */
export type AiToolName = 'getDecisionContext';

/** 中心工具注册表中不由模型修改的治理元数据。 */
export type AiToolDefinitionMetadata = {
  /** 稳定工具名。 */
  name: AiToolName;
  /** 当前工具只读取业务数据，不执行写操作。 */
  riskLevel: 'READ_ONLY';
  /** NestJS 每次工具调用必须重新校验的权限码。 */
  requiredPermissions: readonly ['ai:chat:use', 'decision:read'];
  /** 工具结构化输出允许的最大序列化字符数。 */
  maxOutputCharacters: number;
  /** 单次工具调用超时毫秒数。 */
  timeoutMs: number;
  /** 工具失败后的最大自动重试次数。 */
  maxRetries: number;
  /** 第一版是否允许与其他工具并行执行。 */
  allowParallel: false;
};

/** `getDecisionContext` 允许模型从本次 Run 已确认范围中选择一项决策。 */
export type GetDecisionContextToolInput = {
  /** 必须属于当前 Run 已确认范围，NestJS 会在每次读取时重新鉴权。 */
  decisionId: number;
};

/** `getDecisionContext` 持久化的受控结果摘要。 */
export type GetDecisionContextToolResultSummary = {
  /** 工具真正读取的决策主键。 */
  decisionId: number;
  /** 决策标题。 */
  decisionTitle: string;
  /** 决策状态。 */
  decisionStatus: string;
  /** 所属项目标题。 */
  projectTitle: string;
  /** 所属区域名称；项目级决策为空。 */
  areaName: string | null;
  /** 当前显式参与人数。 */
  participantCount: number;
  /** 工具实际读取的稳定来源 ID。 */
  sourceIds: string[];
};

/** 一次真实工具调用的可审计快照。 */
export type AiToolCall = {
  /** 数据库生成的工具调用记录 UUID。 */
  id: string;
  /** 工具调用所属 Run UUID。 */
  runId: string;
  /** AI SDK 生成并在流协议中使用的工具调用 ID。 */
  toolCallId: string;
  /** Run 内从 1 开始的工具调用序号。 */
  sequence: number;
  /** 中心注册表中的稳定工具名。 */
  toolName: AiToolName;
  /** 当前工具调用状态。 */
  status: AiToolCallStatus;
  /** 经过 Zod 校验且不含凭据的安全输入。 */
  input: GetDecisionContextToolInput;
  /** 成功时保存的受控结果摘要；未完成或失败时为空。 */
  resultSummary: GetDecisionContextToolResultSummary | null;
  /** 失败时的稳定错误码；其他状态为空。 */
  errorCode: string | null;
  /** 工具开始时间；等待执行时为空。 */
  startedAt: string | null;
  /** 工具结束时间；仍运行时为空。 */
  finishedAt: string | null;
  /** 工具完整耗时；仍运行时为空。 */
  durationMs: number | null;
  /** 记录创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
  /** 记录最后更新时间，使用 ISO 8601 字符串。 */
  updatedAt: string;
};
