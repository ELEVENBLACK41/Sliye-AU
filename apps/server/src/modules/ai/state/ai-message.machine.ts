/**
 * 本文件定义 AI 用户消息投递状态的唯一合法转换矩阵和终态分类。
 * 该状态机独立于 AiRun，只描述消息是否等待分发、已被领取或已被新方向替代。
 */

import type { AiMessageDispatchState } from '@workspace/contracts/ai';

/** 用户消息投递状态允许的全部后继状态；已领取和已替代均无出口。 */
export const AI_MESSAGE_DISPATCH_TRANSITIONS = {
  QUEUED: ['DISPATCHED', 'SUPERSEDED'],
  DISPATCHED: [],
  SUPERSEDED: [],
} as const satisfies Readonly<
  Record<AiMessageDispatchState, readonly AiMessageDispatchState[]>
>;

/** 已不允许再次改变投递语义的消息终态。 */
const AI_MESSAGE_DISPATCH_TERMINAL_STATES = new Set<AiMessageDispatchState>([
  'DISPATCHED',
  'SUPERSEDED',
]);

/** 判断用户消息投递状态变化是否存在于唯一合法转换矩阵。 */
export function canTransitionAiMessageDispatchState(
  fromState: AiMessageDispatchState,
  toState: AiMessageDispatchState,
): boolean {
  const allowedStates: readonly AiMessageDispatchState[] =
    AI_MESSAGE_DISPATCH_TRANSITIONS[fromState];

  return allowedStates.includes(toState);
}

/** 判断用户消息是否已经被领取或替代，不能再回到队列。 */
export function isAiMessageDispatchTerminalState(
  state: AiMessageDispatchState,
): boolean {
  return AI_MESSAGE_DISPATCH_TERMINAL_STATES.has(state);
}
