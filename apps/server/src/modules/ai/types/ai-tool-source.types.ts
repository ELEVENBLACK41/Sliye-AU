/**
 * 本文件定义只读工具统一的执行结果结构与来源标识。
 * 工具除了返回模型可见的窄输出以外，还必须显式声明本次调用实际读取了哪些业务来源，
 * 供 Run 级来源依赖登记、来源失权后的历史锁定和引用校验复用；
 * 来源标识只包含稳定类型与主键，不包含来源正文。
 */

import type { AiToolExecutionContext } from './ai-tool-registry.types';

/** 当前已纳入只读决策过程工具允许登记的业务来源类型。 */
export const AI_TOOL_SOURCE_TYPES = [
  'DECISION',
  'DECISION_PROPOSAL',
  'DECISION_VOTE_ROUND',
  'DECISION_RESOLUTION',
] as const;

/** 一条来源依赖的稳定业务来源类型。 */
export type AiToolSourceType = (typeof AI_TOOL_SOURCE_TYPES)[number];

/** 工具本次调用实际读取的一条业务来源标识。 */
export type AiToolSourceRef = {
  /** 稳定的业务来源类型。 */
  sourceType: AiToolSourceType;
  /** 该来源在自身业务表中的主键，统一保存为字符串以兼容不同主键类型。 */
  sourceId: string;
  /** 可直接展示给用户的来源名称；不包含来源正文和敏感字段。 */
  label: string;
};

/** 一次只读工具调用的统一执行结果。 */
export type AiToolExecutionResult<TOutput> = {
  /** 允许进入模型上下文的窄输出。 */
  output: TOutput;
  /** 本次调用实际读取的业务来源；没有读取任何业务记录时为空数组。 */
  sources: readonly AiToolSourceRef[];
};

/**
 * 中心工具注册表按名称解析到的只读工具执行器。
 * 每个业务域的执行器都实现该接口，编排层因此不需要为每个工具写分支代码。
 */
export type AiToolExecutor<TInput, TOutput> = {
  /** 与中心注册表描述一致的稳定工具名称。 */
  readonly toolName: string;
  /** 校验窄输入、按当前执行上下文实时鉴权并返回窄输出与来源标识。 */
  execute(
    executionContext: AiToolExecutionContext,
    input: TInput,
  ): Promise<AiToolExecutionResult<TOutput>>;
};
