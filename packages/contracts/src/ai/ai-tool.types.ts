/**
 * 本文件定义只读工具调用的共享展示契约。
 * 工具原始输入输出不进入消息正文，也不在这里承载业务查询实现；
 * 这里只冻结前后端都需要稳定判断的名称、状态、来源类型与受控摘要结构。
 */

import type { ApiErrorCode } from '../common/api-response.ts';

/** 一次只读工具调用的稳定生命周期状态。 */
export const AI_TOOL_CALL_STATUSES = ['RUNNING', 'SUCCEEDED', 'FAILED'] as const;

/** 工具调用当前状态；RUNNING 表示已发起但尚未返回结果。 */
export type AiToolCallStatus = (typeof AI_TOOL_CALL_STATUSES)[number];

/** 已结束的工具调用状态，用于流事件和展示层收窄。 */
export type AiToolCallSettledStatus = Exclude<AiToolCallStatus, 'RUNNING'>;

/** 当前已纳入只读决策过程工具允许登记的业务来源类型。 */
export const AI_SOURCE_TYPES = ['DECISION', 'DECISION_PROPOSAL', 'DECISION_VOTE_ROUND', 'DECISION_RESOLUTION'] as const;

/** 一条来源依赖的稳定业务来源类型。 */
export type AiSourceType = (typeof AI_SOURCE_TYPES)[number];

/** 来源被一次 Run 使用的方式。 */
export const AI_SOURCE_USAGES = ['READ', 'CITED'] as const;

/** READ 表示工具读取后用于推理，CITED 表示在最终回答中被引用。 */
export type AiSourceUsage = (typeof AI_SOURCE_USAGES)[number];

/** 一次 Run 实际读取或引用的业务来源，可按来源反查受影响的历史内容。 */
export type AiSourceDependency = {
  /** 稳定的业务来源类型。 */
  sourceType: AiSourceType;
  /** 来源在自身业务表中的主键，统一使用字符串以兼容不同主键类型。 */
  sourceId: string;
  /** 来源被本次 Run 使用的方式。 */
  usage: AiSourceUsage;
  /** 登记时的来源名称快照；来源失权后由展示层决定是否隐藏。 */
  label: string;
};

/** 一次只读工具调用的受控展示摘要；不包含来源正文或供应商原始负载。 */
export type AiToolCall = {
  /** 对外稳定的工具调用标识。 */
  id: string;
  /** 工具调用所属 Run 标识。 */
  runId: string;
  /** 中心工具注册表中的稳定工具名称。 */
  toolName: string;
  /** 工具调用当前状态。 */
  status: AiToolCallStatus;
  /** 工具窄输入的受控快照。 */
  input: Record<string, unknown>;
  /** 工具窄输出的受控摘要；尚未结束或失败时为 `null`。 */
  outputSummary: Record<string, unknown> | null;
  /** 失败时可供调用方稳定分支判断的业务错误码；其他状态为 `null`。 */
  failureCode: ApiErrorCode | null;
  /** 失败时的稳定原因说明；其他状态为 `null`。 */
  failureReason: string | null;
  /** 工具执行耗时（毫秒）；尚未结束时为 `null`。 */
  durationMs: number | null;
  /** 本次调用实际读取的业务来源。 */
  sources: AiSourceDependency[];
  /** 工具调用开始时间，使用 ISO 8601 字符串。 */
  startedAt: string;
  /** 工具调用结束时间；尚未结束时为 `null`。 */
  finishedAt: string | null;
};
