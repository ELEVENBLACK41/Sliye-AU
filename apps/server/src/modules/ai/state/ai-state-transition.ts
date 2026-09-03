/**
 * 本文件把 AI Run 的纯状态矩阵转换为服务端统一业务异常。
 * 后续状态持久化服务必须先调用这里校验，再在事务中执行比较更新。
 */

import { HttpStatus } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { AiRunStatus } from '@workspace/contracts/ai';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { canTransitionAiRunStatus } from './ai-run.machine';

/** 断言 Run 可以从当前状态进入目标状态，非法回退或同状态重写统一返回稳定冲突错误。 */
export function assertAiRunStatusTransition(
  fromStatus: AiRunStatus,
  toStatus: AiRunStatus,
): void {
  if (canTransitionAiRunStatus(fromStatus, toStatus)) {
    return;
  }

  throw new BusinessException({
    code: API_ERROR_CODES.AI_RUN_INVALID_STATUS_TRANSITION,
    message: `AI 运行不能从 ${fromStatus} 转换为 ${toStatus}`,
    status: HttpStatus.CONFLICT,
    details: [
      {
        field: 'status',
        rule: 'AI_RUN_STATUS_TRANSITION',
        message: `${fromStatus} -> ${toStatus} 不是合法的 AI 运行状态转换`,
      },
    ],
  });
}
