/**
 * 本文件把首次流和持久化历史中的工具调用投影为同一套安全展示模型。
 */

import type {
  AiRunPublicSummary,
  AiToolCall,
  GetDecisionContextToolResultSummary,
} from '@workspace/contracts/ai';

import type { AiDecisionUiMessage } from '../types/ai-message';

/** 当前唯一真实工具在 AI SDK UI 消息中的类型。 */
export type AiLiveDecisionContextToolPart = Extract<
  AiDecisionUiMessage['parts'][number],
  { type: 'tool-getDecisionContext' }
>;

/** 2.6 工作区可以明确反馈的工具展示状态。 */
export type AiToolDisplayState =
  | 'waiting'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'waiting_approval';

/** 工具卡只允许消费的脱敏安全字段。 */
export type AiToolCallView = {
  /** 实时与历史恢复都稳定复用的工具调用 ID。 */
  id: string;
  /** 面向用户展示的业务名称，而不是内部函数名。 */
  title: string;
  /** 当前可访问反馈状态。 */
  state: AiToolDisplayState;
  /** 经过校验且不含凭据的输入摘要。 */
  inputSummary: { decisionId: number } | null;
  /** 成功时允许展示的受控结果摘要。 */
  resultSummary: GetDecisionContextToolResultSummary | null;
  /** 失败时的稳定错误，不包含堆栈或内部地址。 */
  errorCode: string | null;
  /** 完成后允许展示的工具耗时。 */
  durationMs: number | null;
  /** 工具真正读取的稳定来源 ID。 */
  sourceIds: string[];
};

/** 把 AI SDK 实时工具部件收敛成与历史恢复一致的安全卡片数据。 */
export function toLiveAiToolCallView(part: AiLiveDecisionContextToolPart): AiToolCallView {
  const inputSummary = readLiveToolInput(part);
  const resultSummary = part.state === 'output-available' ? summarizeLiveDecisionContext(part.output) : null;

  return {
    id: part.toolCallId,
    title: '读取决策基础上下文',
    state: mapLiveToolState(part.state),
    inputSummary,
    resultSummary,
    errorCode: part.state === 'output-error' ? part.errorText : null,
    durationMs: null,
    sourceIds: resultSummary?.sourceIds ?? [],
  };
}

/** 把数据库工具审计和父 Run 终态投影为同一张工具卡。 */
export function toHistoricalAiToolCallView(
  toolCall: AiToolCall,
  run: AiRunPublicSummary,
): AiToolCallView {
  return {
    id: toolCall.toolCallId,
    title: '读取决策基础上下文',
    state: mapHistoricalToolState(toolCall, run),
    inputSummary: toolCall.input,
    resultSummary: toolCall.resultSummary,
    errorCode: toolCall.errorCode,
    durationMs: toolCall.durationMs,
    sourceIds: toolCall.resultSummary?.sourceIds ?? [],
  };
}

/** 为尚未开始首个工具调用的排队 Run 创建确定性等待状态。 */
export function createWaitingAiToolCallView(runId: string): AiToolCallView {
  return {
    id: `waiting-${runId}`,
    title: '读取决策基础上下文',
    state: 'waiting',
    inputSummary: null,
    resultSummary: null,
    errorCode: null,
    durationMs: null,
    sourceIds: [],
  };
}

/** 从具备输入的实时工具状态中读取服务端绑定的决策主键。 */
function readLiveToolInput(part: AiLiveDecisionContextToolPart): { decisionId: number } | null {
  if (!('input' in part) || !part.input || typeof part.input !== 'object') {
    return null;
  }

  const decisionId = (part.input as { decisionId?: unknown }).decisionId;
  return typeof decisionId === 'number' ? { decisionId } : null;
}

/** 把真实工具完整输出压缩为工具卡允许显示的受控摘要。 */
function summarizeLiveDecisionContext(
  output: Extract<AiLiveDecisionContextToolPart, { state: 'output-available' }>['output'],
): GetDecisionContextToolResultSummary {
  return {
    decisionId: output.decision.id,
    decisionTitle: output.decision.title,
    decisionStatus: output.decision.status,
    projectTitle: output.project.title,
    areaName: output.area?.name ?? null,
    participantCount: output.decision.participantCount,
    sourceIds: output.sources.map((source) => source.sourceId),
  };
}

/** 映射 AI SDK 工具状态，并为第 4 阶段审批协议保留兼容分支。 */
function mapLiveToolState(state: AiLiveDecisionContextToolPart['state']): AiToolDisplayState {
  switch (state) {
    case 'input-streaming':
      return 'waiting';
    case 'input-available':
    case 'approval-responded':
      return 'running';
    case 'approval-requested':
      return 'waiting_approval';
    case 'output-available':
      return 'success';
    case 'output-error':
      return 'failed';
    case 'output-denied':
      return 'cancelled';
  }
}

/** 使用工具审计状态和父 Run 终态确定历史卡片的真实反馈。 */
function mapHistoricalToolState(toolCall: AiToolCall, run: AiRunPublicSummary): AiToolDisplayState {
  if (toolCall.status === 'COMPLETED') {
    return 'success';
  }
  if (toolCall.status === 'FAILED') {
    return 'failed';
  }
  if (run.status === 'FAILED') {
    return 'failed';
  }
  if (run.status === 'CANCELLED') {
    return 'cancelled';
  }
  if (run.status === 'WAITING_APPROVAL') {
    return 'waiting_approval';
  }
  if (toolCall.status === 'WAITING') {
    return 'waiting';
  }
  return run.status === 'QUEUED' ? 'waiting' : 'running';
}
