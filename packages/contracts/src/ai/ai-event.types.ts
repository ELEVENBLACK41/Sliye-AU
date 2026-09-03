/**
 * 本文件定义可按 Run 内单调序号补拉的第一版 AI 流事件契约。
 * 当前只冻结状态变化和助手文本增量；工具与引用事件在对应步骤按可判别联合扩展。
 */

import type { ApiErrorCode } from '../common/api-response.ts';
import type { AiRunCancellationReason, AiRunFailureReason, AiRunStatus } from './ai-run.types.ts';
import type { AiToolCallSettledStatus } from './ai-tool.types.ts';

/** 已经冻结负载结构的流事件类型；工具事件在 2.4 最小工具链落地时加入。 */
export const AI_EVENT_TYPES = [
  'RUN_STATUS_CHANGED',
  'ASSISTANT_TEXT_DELTA',
  'TOOL_CALL_STARTED',
  'TOOL_CALL_SETTLED',
] as const;

/** 第一版已定义的 AI 流事件类型。 */
export type AiEventType = (typeof AI_EVENT_TYPES)[number];

/** 所有 AI 流事件共同携带的追加日志字段。 */
export type AiEventBase = {
  /** 对外稳定的事件标识。 */
  id: string;
  /** 事件所属 Run 标识。 */
  runId: string;
  /** Run 内从 1 开始且严格单调递增的事件序号。 */
  sequence: number;
  /** 事件持久化时间，使用 ISO 8601 字符串。 */
  createdAt: string;
};

/** Run 状态变化事件携带的旧状态、新状态和可选终止原因。 */
export type AiRunStatusChangedEvent = AiEventBase & {
  /** 供消费者执行联合类型收窄的事件类型。 */
  type: 'RUN_STATUS_CHANGED';
  /** 状态变化的结构化负载。 */
  data: {
    /** 状态变化前的 Run 状态。 */
    fromStatus: AiRunStatus;
    /** 状态变化后的 Run 状态。 */
    toStatus: AiRunStatus;
    /** 取消相关状态变化携带的稳定原因；其他变化为 `null`。 */
    cancellationReason: AiRunCancellationReason | null;
    /** 失败状态变化携带的稳定原因；其他变化为 `null`。 */
    failureReason: AiRunFailureReason | null;
  };
};

/** 助手流式文本增量事件，用于断线后按序补齐尚未形成最终消息的正文。 */
export type AiAssistantTextDeltaEvent = AiEventBase & {
  /** 供消费者执行联合类型收窄的事件类型。 */
  type: 'ASSISTANT_TEXT_DELTA';
  /** 文本增量的结构化负载。 */
  data: {
    /** 当前增量所属的助手消息稳定标识。 */
    messageId: string;
    /** 按事件序号追加到助手消息后的非空文本片段。 */
    delta: string;
    /** UI-first 直出流对应的一个或多个稳定增量标识；旧持久化事件可以省略。 */
    liveDeltaIds?: string[];
    /** UI-first 直出流批次中第一个增量的序号；旧持久化事件可以省略。 */
    liveSequenceStart?: number;
    /** UI-first 直出流批次中最后一个增量的序号；旧持久化事件可以省略。 */
    liveSequenceEnd?: number;
  };
};

/** 只读工具调用发起事件，用于在结果返回前展示真实的工具执行状态。 */
export type AiToolCallStartedEvent = AiEventBase & {
  /** 供消费者执行联合类型收窄的事件类型。 */
  type: 'TOOL_CALL_STARTED';
  /** 工具调用发起时的结构化负载。 */
  data: {
    /** 已持久化的工具调用稳定标识。 */
    toolCallId: string;
    /** 中心工具注册表中的稳定工具名称。 */
    toolName: string;
    /** 工具窄输入的受控快照；不包含密钥、凭据或来源正文。 */
    input: Record<string, unknown>;
  };
};

/** 只读工具调用结束事件，成功与失败都必须显式落库并推送。 */
export type AiToolCallSettledEvent = AiEventBase & {
  /** 供消费者执行联合类型收窄的事件类型。 */
  type: 'TOOL_CALL_SETTLED';
  /** 工具调用结束时的结构化负载。 */
  data: {
    /** 已持久化的工具调用稳定标识。 */
    toolCallId: string;
    /** 中心工具注册表中的稳定工具名称。 */
    toolName: string;
    /** 工具调用的最终状态。 */
    status: AiToolCallSettledStatus;
    /** 成功时的工具窄输出受控摘要；失败时为 `null`。 */
    outputSummary: Record<string, unknown> | null;
    /** 失败时可稳定分支判断的业务错误码；成功时为 `null`。 */
    failureCode: ApiErrorCode | null;
    /** 失败时的稳定原因说明；成功时为 `null`。 */
    failureReason: string | null;
    /** 工具执行耗时（毫秒）。 */
    durationMs: number;
  };
};

/** 当前已冻结负载结构的 AI 流事件可判别联合。 */
export type AiEvent =
  | AiRunStatusChangedEvent
  | AiAssistantTextDeltaEvent
  | AiToolCallStartedEvent
  | AiToolCallSettledEvent;
