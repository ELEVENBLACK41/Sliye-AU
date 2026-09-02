/**
 * 本文件定义 Next.js Agent Runtime 与 NestJS 内部执行接口共享的传输契约。
 * 这里只描述可序列化数据，不包含 AI SDK、NestJS、Prisma 或执行实现。
 */

import type { ApiErrorCode } from '../common/api-response.ts';
import type { AiEvent } from './ai-event.types.ts';
import type { AiLanguageModelRole } from './ai-model.types.ts';
import type { AiRunCancellationReason, AiRunFailureReason, AiRunStatus } from './ai-run.types.ts';

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

/** 一次工具执行实际读取的最小来源标识；不包含正文、凭据或权限上下文。 */
export type AiRuntimeToolSource = {
  /** 来源所属的受控业务类型。 */
  sourceType: 'DECISION' | 'DECISION_RESOLUTION';
  /** 来源在自身业务表中的稳定主键。 */
  sourceId: string;
  /** 已授权调用时可展示的来源名称快照。 */
  label: string;
};

/** 官方工具生命周期开始时创建或重放的受控审计记录。 */
export type AiRuntimeToolCallStartResult =
  | {
      /** 当前调用已新建审计记录，后续允许执行受控业务查询。 */
      state: 'CREATED';
      /** 新建工具调用记录的数据库标识。 */
      toolCallId: string;
    }
  | {
      /** 同一 provider 工具调用已成功，可直接重放受控摘要。 */
      state: 'REPLAY_SUCCEEDED';
      /** 既有工具调用记录的数据库标识。 */
      toolCallId: string;
      /** 可安全交回模型的既有窄输出摘要。 */
      output: unknown;
    }
  | {
      /** 同一 provider 工具调用已失败，可直接重放稳定失败。 */
      state: 'REPLAY_FAILED';
      /** 既有工具调用记录的数据库标识。 */
      toolCallId: string;
      /** 稳定业务错误码。 */
      failureCode: ApiErrorCode;
      /** 可安全交回模型的失败说明。 */
      failureReason: string;
    }
  | {
      /** 既有成功输出已截断，不能把截断标记伪装成真实结果。 */
      state: 'REPLAY_UNAVAILABLE';
      /** 既有工具调用记录的数据库标识。 */
      toolCallId: string;
    }
  | {
      /** 相同调用仍在执行，不允许并发发起第二次业务查询。 */
      state: 'IN_PROGRESS';
      /** 既有工具调用记录的数据库标识。 */
      toolCallId: string;
    };

/** 工具执行阶段返回给官方 lifecycle 结束回调的受控结果。 */
export type AiRuntimeToolExecutionResult =
  | {
      /** 业务查询成功，来源在 lifecycle 结束时统一登记。 */
      status: 'SUCCEEDED';
      /** 已在生命周期开始阶段创建的工具调用记录标识。 */
      toolCallId: string;
      /** 可安全交回模型的窄业务输出。 */
      output: unknown;
      /** 本次查询实际读取的来源，供历史失权判定使用。 */
      sources: AiRuntimeToolSource[];
    }
  | {
      /** 业务查询被拒绝或执行失败。 */
      status: 'FAILED';
      /** 已在生命周期开始阶段创建的工具调用记录标识。 */
      toolCallId: string;
      /** 稳定业务错误码。 */
      failureCode: ApiErrorCode;
      /** 可安全交回模型的失败说明。 */
      failureReason: string;
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
