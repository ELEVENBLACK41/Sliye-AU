/**
 * 本文件把 AI 用户消息投递状态矩阵转换为服务端统一业务异常。
 * 队列事务在更新持久化状态前必须调用这里，避免绕过状态机直接改写终态。
 */

import { HttpStatus } from '@nestjs/common';
import type { AiMessageDispatchState } from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { canTransitionAiMessageDispatchState } from './ai-message.machine';

/** 断言用户消息可以从当前投递状态进入目标状态。 */
export function assertAiMessageDispatchStateTransition(
  fromState: AiMessageDispatchState,
  toState: AiMessageDispatchState,
): void {
  if (canTransitionAiMessageDispatchState(fromState, toState)) {
    return;
  }

  throw new BusinessException({
    code: API_ERROR_CODES.AI_MESSAGE_INVALID_DISPATCH_TRANSITION,
    message: `AI 消息不能从 ${fromState} 转换为 ${toState}`,
    status: HttpStatus.CONFLICT,
    details: [
      {
        field: 'dispatchState',
        rule: 'AI_MESSAGE_DISPATCH_TRANSITION',
        message: `${fromState} -> ${toState} 不是合法的 AI 消息投递状态转换`,
      },
    ],
  });
}
