/**
 * 本文件定义 Agent Runtime 中心工具注册表的描述契约与受控调用上下文。
 * 注册表只表达已批准的只读工具能力；实际工具实现、模型调用和业务查询留给后续增量。
 */

import type {
  AiRuntimeToolAccessMode,
  AiRuntimeToolDataContract,
  AiRuntimeToolDescriptor,
  AiRuntimeToolDiscoveryRequirement,
  AiRuntimeToolField,
  AiRuntimeToolValueType,
} from '@workspace/contracts/ai';
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
export type AiToolAccessMode = AiRuntimeToolAccessMode;

/** 工具契约中字段可使用的基础值类型。 */
export type AiToolValueType = AiRuntimeToolValueType;

/** 工具输入或输出结构中的一个具名字段。 */
export type AiToolFieldDescriptor = AiRuntimeToolField;

/** 工具输入或输出的受控字段结构。 */
export type AiToolDataContract = AiRuntimeToolDataContract;

/**
 * 一项工具对“目标必须先被发现”的声明式依赖。
 * 有该声明的工具只能使用某次发现调用唯一命中的目标标识，
 * 模型不得凭空猜测标识后直接读取业务数据；规则由工具编排层统一强制执行，
 * 因此新增同类工具只需要补一份声明，不需要在编排代码里加分支。
 */
export type AiToolDiscoveryRequirement = AiRuntimeToolDiscoveryRequirement;

/** 一项可注册到 Agent Runtime 的只读工具描述。 */
export type AiToolDescriptor = AiRuntimeToolDescriptor;

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
