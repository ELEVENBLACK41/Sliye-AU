/**
 * 本文件定义 Next.js Agent Runtime 与 NestJS 内部执行接口共享的传输契约。
 * 这里只描述可序列化数据，不包含 AI SDK、NestJS、Prisma 或执行实现。
 */

import type { ApiErrorCode } from '../common/api-response.ts';
import type { AiEvent } from './ai-event.types.ts';
import type { AiLanguageModelRole } from './ai-model.types.ts';
import type { AiRunCancellationReason, AiRunFailureReason, AiRunStatus } from './ai-run.types.ts';
import type { AiSourceType } from './ai-tool.types.ts';

/** 第二阶段内部工具只允许读取业务数据。 */
export type AiRuntimeToolAccessMode = 'READ';

/** 工具字段当前允许声明的基础值类型。 */
export type AiRuntimeToolValueType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'STRING_ARRAY' | 'OBJECT';

/** 内部工具输入或输出中的一个具名字段。 */
export type AiRuntimeToolField = {
  /** 稳定字段名。 */
  name: string;
  /** 字段的基础值类型。 */
  valueType: AiRuntimeToolValueType;
  /** 是否为必填字段。 */
  required: boolean;
  /** 面向模型的字段含义与限制。 */
  description: string;
};

/** 内部工具输入或输出的受控数据结构。 */
export type AiRuntimeToolDataContract = {
  /** 整体数据结构的用途说明。 */
  description: string;
  /** 允许出现的固定字段集合。 */
  fields: readonly AiRuntimeToolField[];
};

/** 工具读取目标前必须完成的实体发现规则。 */
export type AiRuntimeToolDiscoveryRequirement = {
  /** 必须先成功执行的发现工具名称。 */
  discoveryToolName: string;
  /** 当前工具输入中的目标标识字段。 */
  targetInputField: string;
  /** 发现工具输出中的候选数组字段。 */
  candidateListField: string;
  /** 每个候选项中的目标标识字段。 */
  candidateIdentifierField: string;
};

/**
 * 工具的风险等级。
 * L0～L2 覆盖只读、分析和需要用户主动触发的高成本能力；L3 为未来写操作预留，
 * 不能因为 Descriptor 声明了等级就绕过后端权限或审批校验。
 */
export type AiRuntimeToolRiskLevel = 'L0' | 'L1' | 'L2' | 'L3';

/** 工具自动重试策略；重试次数不包含第一次执行。 */
export type AiRuntimeToolRetryPolicy = {
  /** 允许自动重试的最大次数；具体是否可重试仍由执行层按错误类型决定。 */
  maxRetries: number;
};

/** 工具被模型在同一轮并行调用时的策略。 */
export type AiRuntimeToolParallelPolicy = 'ALLOW' | 'DENY';

/** 工具返回模型前必须遵守的结果大小上限。 */
export type AiRuntimeToolResultLimit = {
  /** 最多返回的记录数量；没有列表语义时可以不设置。 */
  maxItems?: number;
  /** 最多返回的文本字符数；结构化字段仍需由执行器单独裁剪。 */
  maxChars?: number;
};

/** 工具在 AI 工作台中展示时使用的名称，不会拼入模型工具描述。 */
export type AiRuntimeToolPresentation = {
  /** 面向用户展示的中文工具名称。 */
  displayName: string;
};

/** 工具统一治理元数据；3.1-A 先冻结结构，3.1-B 再由注册表强制完整校验。 */
export type AiRuntimeToolGovernance = {
  /** 当前工具的风险等级。 */
  riskLevel: AiRuntimeToolRiskLevel;
  /** 工具可能读取并登记的来源类型；不得包含匿名个人选票等禁止来源。 */
  sourceTypes: readonly AiSourceType[];
  /** 工具返回模型的数据数量和文本大小上限。 */
  resultLimit: AiRuntimeToolResultLimit;
  /** 工具失败时的自动重试策略。 */
  retryPolicy: AiRuntimeToolRetryPolicy;
  /** 是否允许与同一模型步骤中的其他工具并行执行。 */
  parallelPolicy: AiRuntimeToolParallelPolicy;
};

/** NestJS 中心注册表批准并发送给 Runtime 的只读工具描述。 */
export type AiRuntimeToolDescriptor = {
  /** 稳定工具名称。 */
  name: string;
  /** 工具用途、适用条件和边界。 */
  description: string;
  /** 第二阶段固定为只读。 */
  accessMode: AiRuntimeToolAccessMode;
  /** 单次调用超时上限，单位为毫秒。 */
  timeoutMs: number;
  /** 工具在 AI 工作台中展示时使用的名称；旧 Descriptor 可在 3.1-B 前暂不提供。 */
  presentation?: AiRuntimeToolPresentation;
  /** 工具的权限、风险、来源、结果、重试和并行治理信息。 */
  governance?: AiRuntimeToolGovernance;
  /** 工具窄输入契约。 */
  input: AiRuntimeToolDataContract;
  /** 工具窄输出契约。 */
  output: AiRuntimeToolDataContract;
  /** 需要唯一实体发现时的声明式规则。 */
  discoveryRequirement?: AiRuntimeToolDiscoveryRequirement;
};

/** 一条经过服务端上下文预算裁剪的历史消息。 */
export type AiRuntimeContextMessage = {
  /** 消息发送方。 */
  role: 'USER' | 'ASSISTANT';
  /** 允许进入模型上下文的正文。 */
  content: string;
};

/** Runtime 成功领取 Run 后获得的受控执行信息。 */
export type AiRuntimeExecution = {
  /** 本次领取的 Run 标识。 */
  runId: string;
  /** Run 所属 Thread 标识。 */
  threadId: string;
  /** Thread 所有者，也是实时鉴权用户。 */
  ownerUserId: number;
  /** 本次 Run 对应的用户消息标识。 */
  userMessageId: string;
  /** 本次 Run 对应的用户消息正文。 */
  userMessageContent: string;
  /** 本次运行使用的逻辑模型角色。 */
  modelRole: AiLanguageModelRole;
  /** 当前执行器持有的租约标识。 */
  executionLeaseId: string;
  /** 当前租约过期时间，使用 ISO 8601 字符串。 */
  executionLeaseExpiresAt: string;
};

/** Runtime 领取成功后获得的完整可序列化会话。 */
export type AiRuntimeSession = {
  /** 当前受控执行信息。 */
  execution: AiRuntimeExecution;
  /** 受预算限制的最近历史消息。 */
  recentMessages: AiRuntimeContextMessage[];
  /** 当前允许使用的只读工具目录。 */
  tools: AiRuntimeToolDescriptor[];
};

/** 一次工具调用成功或失败后的内部响应。 */
export type AiRuntimeToolInvocationResult =
  | {
      /** 工具成功完成。 */
      status: 'SUCCEEDED';
      /** 持久化工具调用标识。 */
      toolCallId: string;
      /** 允许返回模型的窄输出。 */
      output: unknown;
      /** 本次事务新提交的工具开始/结束事件；幂等重放时为空数组。 */
      events: AiEvent[];
    }
  | {
      /** 工具被拒绝或执行失败。 */
      status: 'FAILED';
      /** 持久化工具调用标识。 */
      toolCallId: string;
      /** 稳定错误码。 */
      failureCode: ApiErrorCode;
      /** 可以安全交回模型的失败说明。 */
      failureReason: string;
      /** 本次事务新提交的工具开始/结束事件；幂等重放时为空数组。 */
      events: AiEvent[];
    };

/** Run 进入终态后的内部响应。 */
export type AiRuntimeRunStopResult = {
  /** 已收敛的 Run 标识。 */
  runId: string;
  /** 收敛后的终态。 */
  status: AiRunStatus;
  /** 同一 Thread 中已领取的下一条 Run；没有则为空。 */
  nextRunId: string | null;
  /** 本次终态事务新提交的工具收敛与 Run 状态事件。 */
  events: AiEvent[];
  /** 本次回执中最后一个事件的序号；没有新事件时为空。 */
  lastSequence: number | null;
};

/** 一次过期租约与孤儿排队 Run 对账的内部响应。 */
export type AiRuntimeReconciliationResult = {
  /** 扫描到的过期租约候选数量。 */
  scannedRunCount: number;
  /** 实际完成终态收敛的数量。 */
  reconciledRunCount: number;
  /**
   * 识别出的孤儿排队 Run 数量。
   * 指已创建并占用 Thread 活跃指针、但始终没有被任何执行器领取的 Run，
   * 它们没有执行租约，只能靠本次对账重新交回 Runtime 派发。
   */
  orphanQueuedRunCount: number;
  /** 需要 Runtime 启动的 Run：对账事务领取的后继 Run 与孤儿排队 Run。 */
  nextRunIds: string[];
};

/** 浏览器按序补拉 Run 事件时返回的状态快照和事件页。 */
export type AiRunEventPage = {
  /** Run 标识。 */
  runId: string;
  /** Run 所属 Thread 标识。 */
  threadId: string;
  /** 当前 Run 状态。 */
  status: AiRunStatus;
  /** 取消原因；非取消路径为空。 */
  cancellationReason: AiRunCancellationReason | null;
  /** 失败原因；非失败路径为空。 */
  failureReason: AiRunFailureReason | null;
  /** 失败错误码；非失败路径为空。 */
  failureCode: ApiErrorCode | null;
  /** 当前页事件。 */
  events: AiEvent[];
  /** 当前页最后一个事件序号。 */
  lastSequence: number;
  /** 是否还有更多事件。 */
  hasMore: boolean;
};
