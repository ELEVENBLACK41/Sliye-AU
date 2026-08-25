/**
 * 本文件以完整状态笛卡尔积验证 AI 用户消息投递状态机的合法转换、非法转换和终态。
 */

import { HttpStatus } from '@nestjs/common';
import {
  AI_MESSAGE_DISPATCH_STATES,
  type AiMessageDispatchState,
} from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import {
  AI_MESSAGE_DISPATCH_TRANSITIONS,
  canTransitionAiMessageDispatchState,
  isAiMessageDispatchTerminalState,
} from './ai-message.machine';
import { assertAiMessageDispatchStateTransition } from './ai-message-state-transition';

/** 2.2-C 已冻结的全部合法消息投递状态转换。 */
const LEGAL_TRANSITIONS = [
  ['QUEUED', 'DISPATCHED'],
  ['QUEUED', 'SUPERSEDED'],
] as const satisfies readonly (
  readonly [AiMessageDispatchState, AiMessageDispatchState]
)[];

/** 为未被合法白名单覆盖的状态组合生成拒绝测试样例。 */
function createIllegalTransitions(): Array<
  readonly [AiMessageDispatchState, AiMessageDispatchState]
> {
  const legalTransitionKeys = new Set(
    LEGAL_TRANSITIONS.map(([fromState, toState]) => `${fromState}:${toState}`),
  );

  return AI_MESSAGE_DISPATCH_STATES.flatMap((fromState) =>
    AI_MESSAGE_DISPATCH_STATES.filter(
      (toState) => !legalTransitionKeys.has(`${fromState}:${toState}`),
    ).map((toState) => [fromState, toState] as const),
  );
}

describe('AI Message 投递状态机', () => {
  it.each(LEGAL_TRANSITIONS)('应允许 %s -> %s', (fromState, toState) => {
    expect(canTransitionAiMessageDispatchState(fromState, toState)).toBe(true);
    expect(() =>
      assertAiMessageDispatchStateTransition(fromState, toState),
    ).not.toThrow();
  });

  it.each(createIllegalTransitions())(
    '应拒绝 %s -> %s',
    (fromState, toState) => {
      expect(canTransitionAiMessageDispatchState(fromState, toState)).toBe(false);

      try {
        assertAiMessageDispatchStateTransition(fromState, toState);
        throw new Error('非法消息投递状态转换没有抛出异常');
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessException);
        expect(error).toMatchObject({
          code: API_ERROR_CODES.AI_MESSAGE_INVALID_DISPATCH_TRANSITION,
        });
        expect((error as BusinessException).getStatus()).toBe(
          HttpStatus.CONFLICT,
        );
      }
    },
  );

  it.each(['DISPATCHED', 'SUPERSEDED'] as const)(
    '应把 %s 识别为无出口终态',
    (state) => {
      expect(AI_MESSAGE_DISPATCH_TRANSITIONS[state]).toEqual([]);
      expect(isAiMessageDispatchTerminalState(state)).toBe(true);
    },
  );

  it('应把 QUEUED 识别为唯一可继续投递的状态', () => {
    expect(isAiMessageDispatchTerminalState('QUEUED')).toBe(false);
  });
});
