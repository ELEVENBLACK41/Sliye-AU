/**
 * 本文件根据已持久化的工具调用状态生成安全的用户可见阶段摘要。
 * 摘要只使用工具生命周期事实，不展示原始思维链、工具内部名称或业务主键。
 */

import type { AiMessageRun, AiMessageToolCall } from '@workspace/contracts/ai';

/** 一个工具在用户可见过程中的三种安全文案。 */
type AiProcessCopy = {
  /** 工具仍在执行时的阶段文案。 */
  running: string;
  /** 工具成功结束后的阶段文案。 */
  succeeded: string;
  /** 工具失败结束后的阶段文案。 */
  failed: string;
};

/** 已知业务工具的阶段文案；未知工具统一使用中性查询文案。 */
const AI_PROCESS_COPIES: Record<string, AiProcessCopy> = {
  findDecisionCandidates: {
    running: '正在确认可访问的决策',
    succeeded: '已完成可访问决策确认',
    failed: '决策确认未完成',
  },
  getDecisionContext: {
    running: '正在读取已确认的决策信息',
    succeeded: '已完成决策信息读取',
    failed: '决策信息读取未完成',
  },
  getMyDecisionParticipationStats: {
    running: '正在统计参与的决策',
    succeeded: '已完成参与决策统计',
    failed: '参与决策统计未完成',
  },
  parallel_search: {
    running: '正在检索外部资料',
    succeeded: '已完成外部资料检索',
    failed: '外部资料检索未完成',
  },
};

/** 阶段摘要及其是否仍需要动态展示。 */
export type AiProcessSummary = {
  /** 不包含内部工具名、错误码或业务主键的安全文案。 */
  text: string;
  /** 最近一次工具调用是否仍在执行。 */
  isRunning: boolean;
};

/** 根据助手 Run 最近一次工具调用生成可恢复的阶段摘要。 */
export function toAiProcessSummary(run: AiMessageRun | null): AiProcessSummary | null {
  const latestToolCall = run?.toolCalls.at(-1);
  if (!latestToolCall) {
    return null;
  }

  return toToolProcessSummary(latestToolCall);
}

/** 将单次工具调用状态映射为中性用户可见文案。 */
function toToolProcessSummary(toolCall: AiMessageToolCall): AiProcessSummary {
  const copy =
    AI_PROCESS_COPIES[toolCall.toolName] ??
    ({
      running: '正在执行只读查询',
      succeeded: '已完成只读查询',
      failed: '只读查询未完成',
    } satisfies AiProcessCopy);

  if (toolCall.status === 'RUNNING') {
    return { text: copy.running, isRunning: true };
  }

  return {
    text: toolCall.status === 'SUCCEEDED' ? copy.succeeded : copy.failed,
    isRunning: false,
  };
}
