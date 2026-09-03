/**
 * 本文件以完整状态笛卡尔积验证 AI Run 合法转换、非法转换和终态分类。
 */

import { HttpStatus } from '@nestjs/common';
import { AI_RUN_STATUSES, type AiRunStatus } from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import {
  AI_RUN_STATUS_TRANSITIONS,
  canTransitionAiRunStatus,
  isAiRunNonTerminalStatus,
  isAiRunTerminalStatus,
} from './ai-run.machine';
import { assertAiRunStatusTransition } from './ai-state-transition';

/** 路线图明确允许的全部 Run 状态转换。 */
const LEGAL_TRANSITIONS = [
  ['QUEUED', 'RUNNING'],
  ['QUEUED', 'CANCELLED'],
  ['RUNNING', 'WAITING_APPROVAL'],
  ['RUNNING', 'CANCELLATION_REQUESTED'],
  ['RUNNING', 'COMPLETED'],
  ['RUNNING', 'FAILED'],
  ['WAITING_APPROVAL', 'RUNNING'],
  ['WAITING_APPROVAL', 'CANCELLATION_REQUESTED'],
  ['CANCELLATION_REQUESTED', 'CANCELLED'],
  ['CANCELLATION_REQUESTED', 'FAILED'],
] as const satisfies readonly (readonly [AiRunStatus, AiRunStatus])[];

/** 为全部未被白名单覆盖的状态组合生成非法转换测试样例。 */
function createIllegalTransitions(): Array<
  readonly [AiRunStatus, AiRunStatus]
> {
  const legalTransitionKeys = new Set(
    LEGAL_TRANSITIONS.map(
      ([fromStatus, toStatus]) => `${fromStatus}:${toStatus}`,
    ),
  );

  return AI_RUN_STATUSES.flatMap((fromStatus) =>
    AI_RUN_STATUSES.filter(
      (toStatus) => !legalTransitionKeys.has(`${fromStatus}:${toStatus}`),
    ).map((toStatus) => [fromStatus, toStatus] as const),
  );
}

describe('AI Run 状态机', () => {
  it.each(LEGAL_TRANSITIONS)('应允许 %s -> %s', (fromStatus, toStatus) => {
    expect(canTransitionAiRunStatus(fromStatus, toStatus)).toBe(true);
    expect(() =>
      assertAiRunStatusTransition(fromStatus, toStatus),
    ).not.toThrow();
  });

  it.each(createIllegalTransitions())(
    '应拒绝 %s -> %s',
    (fromStatus, toStatus) => {
      expect(canTransitionAiRunStatus(fromStatus, toStatus)).toBe(false);

      try {
        assertAiRunStatusTransition(fromStatus, toStatus);
        throw new Error('非法状态转换没有抛出异常');
      } catch (error) {
        expect(error).toBeInstanceOf(BusinessException);
        expect(error).toMatchObject({
          code: API_ERROR_CODES.AI_RUN_INVALID_STATUS_TRANSITION,
        });
        expect((error as BusinessException).getStatus()).toBe(
          HttpStatus.CONFLICT,
        );
      }
    },
  );

  it.each(['CANCELLED', 'COMPLETED', 'FAILED'] as const)(
    '应把 %s 识别为无出口终态',
    (status) => {
      expect(AI_RUN_STATUS_TRANSITIONS[status]).toEqual([]);
      expect(isAiRunTerminalStatus(status)).toBe(true);
      expect(isAiRunNonTerminalStatus(status)).toBe(false);
    },
  );

  it.each([
    'QUEUED',
    'RUNNING',
    'WAITING_APPROVAL',
    'CANCELLATION_REQUESTED',
  ] as const)('应把 %s 识别为占用 Thread 门禁的非终态', (status) => {
    expect(isAiRunNonTerminalStatus(status)).toBe(true);
    expect(isAiRunTerminalStatus(status)).toBe(false);
  });
});
