/**
 * 本文件定义 Agent Runtime 中心工具注册表的描述契约与受控调用上下文。
 * 注册表只表达已批准的只读工具能力；实际工具实现、模型调用和业务查询留给后续增量。
 */

import type { ClaimedAiRuntimeExecution } from './ai-runtime.types';

/** 第二阶段当前允许注册的工具访问模式。 */
export const AI_TOOL_ACCESS_MODES = ['READ'] as const;

/** 工具输入或输出字段允许声明的基础值类型。 */
export const AI_TOOL_VALUE_TYPES = [
  'STRING',
  'NUMBER',
  'BOOLEAN',
  'STRING_ARRAY',
  'OBJECT',
] as const;

/** 一项工具可执行操作的访问模式。 */
export type AiToolAccessMode = (typeof AI_TOOL_ACCESS_MODES)[number];

/** 工具契约中字段可使用的基础值类型。 */
export type AiToolValueType = (typeof AI_TOOL_VALUE_TYPES)[number];

/** 工具输入或输出结构中的一个具名字段。 */
export type AiToolFieldDescriptor = {
  /** 面向 Runtime 的稳定字段名。 */
  name: string;
  /** 字段在调用时使用的基础值类型。 */
  valueType: AiToolValueType;
  /** 该字段是否为调用所必需。 */
  required: boolean;
  /** 字段的业务含义与使用限制。 */
  description: string;
};

/** 工具输入或输出的受控字段结构。 */
export type AiToolDataContract = {
  /** 工具输入或输出整体代表的业务数据。 */
  description: string;
  /** 固定字段集合；不允许由模型自行扩展未注册字段。 */
  fields: readonly AiToolFieldDescriptor[];
};

/**
 * 一项工具对“目标必须先被发现”的声明式依赖。
 * 有该声明的工具只能使用某次发现调用唯一命中的目标标识，
 * 模型不得凭空猜测标识后直接读取业务数据；规则由工具编排层统一强制执行，
 * 因此新增同类工具只需要补一份声明，不需要在编排代码里加分支。
 */
export type AiToolDiscoveryRequirement = {
  /** 必须先在同一 Run 内成功执行的发现工具名称。 */
  discoveryToolName: string;
  /** 本工具输入中承载目标标识的字段名。 */
  targetInputField: string;
  /** 发现工具输出候选数组的字段名。 */
  candidateListField: string;
  /** 发现工具候选项中承载目标标识的字段名。 */
  candidateIdentifierField: string;
};

/** 一项可注册到 Agent Runtime 的只读工具描述。 */
export type AiToolDescriptor = {
  /** 供 Runtime、审计和后续模型工具调用复用的稳定工具名称。 */
  name: string;
  /** 明确工具何时应使用、何时不应使用的受控说明。 */
  description: string;
  /** 第二阶段仅允许只读工具，写业务能力不在此目录中注册。 */
  accessMode: AiToolAccessMode;
  /** 单次工具调用的超时上限，单位为毫秒。 */
  timeoutMs: number;
  /** 工具接受的窄输入结构。 */
  input: AiToolDataContract;
  /** 工具返回的窄输出结构。 */
  output: AiToolDataContract;
  /** 目标必须先被发现工具唯一命中时的声明；不需要前置发现的工具省略该字段。 */
  discoveryRequirement?: AiToolDiscoveryRequirement;
};

/** 工具调用时从已领取 Run 派生的受控身份与执行状态。 */
export type AiToolExecutionContext = Pick<
  ClaimedAiRuntimeExecution,
  | 'runId'
  | 'threadId'
  | 'ownerUserId'
  | 'executionLeaseId'
  | 'executionLeaseExpiresAt'
>;

/** NestJS 注入中心工具描述集合时使用的内部 Token。 */
export const AI_TOOL_DESCRIPTORS = Symbol('AI_TOOL_DESCRIPTORS');

/** NestJS 注入全部已注册工具执行器时使用的内部 Token。 */
export const AI_TOOL_EXECUTORS = Symbol('AI_TOOL_EXECUTORS');
