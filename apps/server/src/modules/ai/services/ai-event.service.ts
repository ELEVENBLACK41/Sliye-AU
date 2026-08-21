/**
 * 本文件负责按 Run 内单调序号原子追加可恢复 AI 事件。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client-runtime-utils';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import { assertAiRunStatusTransition } from '../state/ai-state-transition';
import type {
  AppendAiEventCommand,
  AppendAiEventResult,
} from '../types/ai-state-persistence.types';

@Injectable()
export class AiEventService {
  /** 注入数据库以原子递增 Run 事件序号并追加事件。 */
  constructor(private readonly prisma: PrismaService) {}

  /** 追加一条事件并返回数据库分配的严格单调序号。 */
  async append(command: AppendAiEventCommand): Promise<AppendAiEventResult> {
    this.assertEventPayload(command);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const run = await tx.aiRun.update({
          where: { id: command.runId },
          data: { nextEventSequence: { increment: 1 } },
          select: { nextEventSequence: true },
        });
        const sequence = run.nextEventSequence - 1;
        const event = await tx.aiEvent.create({
          data: {
            runId: command.runId,
            sequence,
            type: command.type,
            payload: command.data,
          },
        });

        return {
          id: event.id,
          runId: event.runId,
          sequence: event.sequence,
          type: command.type,
          data: command.data,
          createdAt: event.createdAt.toISOString(),
        } as AppendAiEventResult;
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new BusinessException({
          code: API_ERROR_CODES.AI_RUN_NOT_FOUND,
          message: 'AI 运行不存在',
          status: HttpStatus.NOT_FOUND,
        });
      }
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BusinessException({
          code: API_ERROR_CODES.AI_EVENT_SEQUENCE_CONFLICT,
          message: 'AI 运行事件序号发生冲突',
          status: HttpStatus.CONFLICT,
        });
      }
      throw error;
    }
  }

  /** 校验事件负载中当前步骤已经冻结的不变量。 */
  private assertEventPayload(command: AppendAiEventCommand): void {
    if (command.type === 'RUN_STATUS_CHANGED') {
      assertAiRunStatusTransition(
        command.data.fromStatus,
        command.data.toStatus,
      );
      return;
    }

    if (!command.data.delta) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
        message: '助手文本增量不能为空',
        status: HttpStatus.BAD_REQUEST,
      });
    }
  }
}
