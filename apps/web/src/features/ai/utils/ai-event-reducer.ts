/**
 * 本文件把已持久化的 AI Run 领域事件归约为浏览器可渲染的运行快照。
 *
 * Reducer 不产生副作用：它只按 `runId + sequence` 去重、缓存乱序事件、
 * 应用连续事件，并把未知事件记录到诊断列表。未知事件不会被推断为完成。
 */

import {
  AI_RUN_STATUSES,
  type AiEvent,
  type AiRunCancellationReason,
  type AiRunFailureReason,
  type AiRunStatus,
  type AiToolCallSettledStatus,
} from '@workspace/contracts/ai';
import type { ApiErrorCode } from '@workspace/contracts/common';

/** 浏览器侧维护的单次 Run 工具调用展示快照。 */
export type AiEventToolCall = {
  /** 工具调用稳定标识。 */
  id: string;
  /** 中心工具注册表中的工具名称。 */
  toolName: string;
  /** 工具当前展示状态。 */
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  /** 工具开始事件提供的受控输入。 */
  input: Record<string, unknown>;
  /** 工具结束事件提供的受控输出摘要。 */
  outputSummary: Record<string, unknown> | null;
  /** 工具失败时的稳定错误码。 */
  failureCode: ApiErrorCode | null;
  /** 工具失败时的安全说明。 */
  failureReason: string | null;
  /** 工具执行耗时；尚未结束时为空。 */
  durationMs: number | null;
};

/** 一次 Run 事件归约后的纯状态。 */
export type AiEventReducerState = {
  /** 当前状态所属 Run 标识。 */
  runId: string;
  /** 已经连续确认并应用到状态的最后事件序号。 */
  lastSequence: number;
  /** 当前 Run 的最新状态；初始值可来自 Thread 详情。 */
  status: AiRunStatus | null;
  /** 取消原因；非取消路径为空。 */
  cancellationReason: AiRunCancellationReason | null;
  /** 失败原因；非失败路径为空。 */
  failureReason: AiRunFailureReason | null;
  /** 失败业务错误码；非失败路径为空。 */
  failureCode: ApiErrorCode | null;
  /** 当前 Run 产生的助手消息标识。 */
  assistantMessageId: string | null;
  /** 按事件顺序拼接出的助手正文。 */
  assistantText: string;
  /** 当前 Run 的工具调用展示快照。 */
  toolCalls: readonly AiEventToolCall[];
  /** 等待前序事件到达的乱序事件。 */
  pendingEvents: ReadonlyMap<number, AiEventRecord>;
  /** 开发期诊断信息，不参与完成态判断。 */
  diagnostics: readonly string[];
};

/** 创建一个新的 Run 事件归约状态。 */
export function createAiEventReducerState(
  runId: string,
  initial?: {
    status?: AiRunStatus | null;
  },
): AiEventReducerState {
  return {
    runId,
    lastSequence: 0,
    status: initial?.status ?? null,
    cancellationReason: null,
    failureReason: null,
    failureCode: null,
    assistantMessageId: null,
    assistantText: '',
    toolCalls: [],
    pendingEvents: new Map(),
    diagnostics: [],
  };
}

/**
 * 归约一条来自 SSE 的未知数据。
 *
 * 合法但未知的事件会消耗自己的序号并被安全忽略；这样重连不会反复拉取
 * 同一未知事件，同时也不会因为未知类型而错误地把 Run 视为已完成。
 */
export function reduceAiEvent(state: AiEventReducerState, input: unknown): AiEventReducerState {
  const event = toAiEventRecord(input);

  if (!event) {
    return appendDiagnostic(state, '收到结构不完整的 AI 事件，已忽略');
  }

  if (event.runId !== state.runId) {
    return state;
  }

  if (event.sequence <= state.lastSequence || state.pendingEvents.has(event.sequence)) {
    return state;
  }

  const pendingEvents = new Map(state.pendingEvents);
  pendingEvents.set(event.sequence, event);
  const nextState =
    event.sequence > state.lastSequence + 1
      ? appendDiagnostic({ ...state, pendingEvents }, `AI 事件序号出现间隔，等待 sequence ${state.lastSequence + 1}`)
      : { ...state, pendingEvents };

  return drainContiguousEvents(nextState);
}

/**
 * 将 SSE 中的 Run 状态快照合并到 reducer 状态。
 *
 * 状态快照不推进事件游标；事件游标只由实际收到并归约的领域事件确认，
 * 防止网络异常时跳过仍未应用的事件。
 */
export function applyAiRunSnapshot(
  state: AiEventReducerState,
  snapshot: {
    runId: string;
    status: AiRunStatus;
    cancellationReason: AiRunCancellationReason | null;
    failureReason: AiRunFailureReason | null;
    failureCode: ApiErrorCode | null;
  },
): AiEventReducerState {
  if (snapshot.runId !== state.runId) {
    return state;
  }

  return {
    ...state,
    status: snapshot.status,
    cancellationReason: snapshot.cancellationReason,
    failureReason: snapshot.failureReason,
    failureCode: snapshot.failureCode,
  };
}

/** 判断 Run 是否仍可能产生新的事件。 */
export function isAiRunActive(status: AiRunStatus | null): boolean {
  return (
    status === 'QUEUED' || status === 'RUNNING' || status === 'WAITING_APPROVAL' || status === 'CANCELLATION_REQUESTED'
  );
}

/** 判断 Run 是否已经进入不可继续变化的终态。 */
export function isAiRunTerminal(status: AiRunStatus | null): boolean {
  return status === 'CANCELLED' || status === 'COMPLETED' || status === 'FAILED';
}

/** 依次应用已经补齐的事件，直到下一个序号仍未到达。 */
function drainContiguousEvents(state: AiEventReducerState): AiEventReducerState {
  let current = state;

  while (current.pendingEvents.has(current.lastSequence + 1)) {
    const sequence = current.lastSequence + 1;
    const event = current.pendingEvents.get(sequence);

    if (!event) {
      break;
    }

    const pendingEvents = new Map(current.pendingEvents);
    pendingEvents.delete(sequence);
    current = applyAiEvent(
      {
        ...current,
        pendingEvents,
        lastSequence: sequence,
      },
      event,
    );
  }

  return current;
}

/** 应用一条已经确认处于连续序列中的领域事件。 */
function applyAiEvent(state: AiEventReducerState, event: AiEventRecord): AiEventReducerState {
  switch (event.type) {
    case 'RUN_STATUS_CHANGED':
      return applyRunStatusChangedEvent(state, event.data);
    case 'ASSISTANT_TEXT_DELTA':
      return applyAssistantTextDeltaEvent(state, event.data);
    case 'TOOL_CALL_STARTED':
      return applyToolCallStartedEvent(state, event.data);
    case 'TOOL_CALL_SETTLED':
      return applyToolCallSettledEvent(state, event.data);
    default:
      return appendDiagnostic(state, `未知 AI 事件类型 ${event.type}，已保守忽略`);
  }
}

/** 应用 Run 状态变化事件，并保留失败与取消路径的结构化原因。 */
function applyRunStatusChangedEvent(state: AiEventReducerState, data: unknown): AiEventReducerState {
  if (!isRecord(data) || !isAiRunStatus(data.toStatus)) {
    return appendDiagnostic(state, 'RUN_STATUS_CHANGED 负载无效，已忽略状态变化');
  }

  return {
    ...state,
    status: data.toStatus,
    cancellationReason: isNullableString(data.cancellationReason)
      ? (data.cancellationReason as AiRunCancellationReason | null)
      : null,
    failureReason: isNullableString(data.failureReason) ? (data.failureReason as AiRunFailureReason | null) : null,
  };
}

/** 按消息标识追加助手文本增量，拒绝把不同助手消息拼在一起。 */
function applyAssistantTextDeltaEvent(state: AiEventReducerState, data: unknown): AiEventReducerState {
  if (!isRecord(data) || typeof data.messageId !== 'string' || typeof data.delta !== 'string') {
    return appendDiagnostic(state, 'ASSISTANT_TEXT_DELTA 负载无效，已忽略文本增量');
  }

  if (state.assistantMessageId && state.assistantMessageId !== data.messageId) {
    return appendDiagnostic(state, '同一 Run 出现多个助手消息，已忽略后续文本');
  }

  return {
    ...state,
    assistantMessageId: state.assistantMessageId ?? data.messageId,
    assistantText: state.assistantText + data.delta,
  };
}

/** 应用工具调用开始事件，重复的工具标识不会覆盖已经结束的结果。 */
function applyToolCallStartedEvent(state: AiEventReducerState, data: unknown): AiEventReducerState {
  if (
    !isRecord(data) ||
    typeof data.toolCallId !== 'string' ||
    typeof data.toolName !== 'string' ||
    !isRecord(data.input)
  ) {
    return appendDiagnostic(state, 'TOOL_CALL_STARTED 负载无效，已忽略工具开始状态');
  }

  const existing = state.toolCalls.find((toolCall) => toolCall.id === data.toolCallId);
  if (existing) {
    return state;
  }

  return {
    ...state,
    toolCalls: [
      ...state.toolCalls,
      {
        id: data.toolCallId,
        toolName: data.toolName,
        status: 'RUNNING',
        input: data.input,
        outputSummary: null,
        failureCode: null,
        failureReason: null,
        durationMs: null,
      },
    ],
  };
}

/** 应用工具调用结束事件，并把成功与失败分别映射为稳定展示状态。 */
function applyToolCallSettledEvent(state: AiEventReducerState, data: unknown): AiEventReducerState {
  if (
    !isRecord(data) ||
    typeof data.toolCallId !== 'string' ||
    typeof data.toolName !== 'string' ||
    !isAiToolCallSettledStatus(data.status) ||
    !isNullableRecord(data.outputSummary) ||
    !isNullableString(data.failureCode) ||
    !isNullableString(data.failureReason) ||
    typeof data.durationMs !== 'number'
  ) {
    return appendDiagnostic(state, 'TOOL_CALL_SETTLED 负载无效，已忽略工具结束状态');
  }

  const settled = {
    status: data.status,
    outputSummary: data.outputSummary,
    failureCode: data.failureCode as ApiErrorCode | null,
    failureReason: data.failureReason,
    durationMs: data.durationMs,
  } as const;
  const index = state.toolCalls.findIndex((toolCall) => toolCall.id === data.toolCallId);

  if (index === -1) {
    return {
      ...state,
      toolCalls: [
        ...state.toolCalls,
        {
          id: data.toolCallId,
          toolName: data.toolName,
          status: settled.status,
          input: {},
          outputSummary: settled.outputSummary,
          failureCode: settled.failureCode,
          failureReason: settled.failureReason,
          durationMs: settled.durationMs,
        },
      ],
    };
  }

  const toolCalls = [...state.toolCalls];
  toolCalls[index] = { ...toolCalls[index], ...settled, toolName: data.toolName };

  return { ...state, toolCalls };
}

/** 把未知输入收窄为至少具备 Run、序号、类型和负载的事件记录。 */
function toAiEventRecord(input: unknown): AiEventRecord | null {
  if (
    !isRecord(input) ||
    typeof input.runId !== 'string' ||
    !isPositiveSafeInteger(input.sequence) ||
    typeof input.type !== 'string'
  ) {
    return null;
  }

  return {
    runId: input.runId,
    sequence: input.sequence,
    type: input.type,
    data: input.data,
  };
}

/** 判断值是否为普通对象，排除数组和 null。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 判断值是否为普通对象或 null。 */
function isNullableRecord(value: unknown): value is Record<string, unknown> | null {
  return value === null || isRecord(value);
}

/** 判断值是否为字符串或 null。 */
function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

/** 判断值是否为正的安全整数。 */
function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** 判断状态值是否属于共享 Run 状态机。 */
function isAiRunStatus(value: unknown): value is AiRunStatus {
  return typeof value === 'string' && (AI_RUN_STATUSES as readonly string[]).includes(value);
}

/** 判断工具结束状态是否属于共享工具状态机。 */
function isAiToolCallSettledStatus(value: unknown): value is AiToolCallSettledStatus {
  return value === 'SUCCEEDED' || value === 'FAILED';
}

/** 限制诊断数量，避免异常流把浏览器状态无限增长。 */
function appendDiagnostic(state: AiEventReducerState, message: string): AiEventReducerState {
  if (state.diagnostics.includes(message)) {
    return state;
  }

  return {
    ...state,
    diagnostics: [...state.diagnostics.slice(-9), message],
  };
}

/** Reducer 内部使用的最小事件结构，允许安全保留未知事件类型。 */
type AiEventRecord = Pick<AiEvent, 'runId' | 'sequence'> & {
  /** 事件类型由 SSE 运行时提供，未知值必须可被安全忽略。 */
  type: string;
  /** 事件负载由共享契约校验或在应用时进一步收窄。 */
  data: unknown;
};
