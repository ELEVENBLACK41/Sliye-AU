/**
 * 本文件负责按 Run 内单调序号原子追加可恢复 AI 事件。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client-runtime-utils';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { AiRunStatus } from '../../../generated/prisma';
import type {
  AppendAiEventCommand,
  AppendAiEventResult,
} from '../types/ai-state-persistence.types';
import { AiThreadScopeService } from './ai-thread-scope.service';

@Injectable()
export class AiEventService {
  /** 注入 Thread 范围服务以在同一事务中复核来源并追加事件。 */
  constructor(private readonly threadScopeService: AiThreadScopeService) {}

  /** 追加一条事件并返回数据库分配的严格单调序号。 */
  async append(command: AppendAiEventCommand): Promise<AppendAiEventResult> {
    this.assertEventPayload(command);

    try {
      return await this.threadScopeService.withAccessibleRun(
        command.authorization,
        command.runId,
        [],
        async (tx) => {
          const now = new Date();
          const fenced = await tx.aiRun.updateMany({
            where: {
              id: command.runId,
              status: AiRunStatus.RUNNING,
              executionLeaseId: command.executionLeaseId,
              executionLeaseExpiresAt: { gt: now },
            },
            data: { nextEventSequence: { increment: 1 } },
          });
          if (fenced.count !== 1) {
            const exists = await tx.aiRun.findUnique({
              where: { id: command.runId },
              select: { id: true },
            });
            if (!exists) {
              this.throwRunNotFound();
            }
            this.throwExecutionLeaseInvalid();
          }
          const run = await tx.aiRun.findUniqueOrThrow({
            where: { id: command.runId },
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
          };
        },
      );
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
    if (!UUID_PATTERN.test(command.executionLeaseId)) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
        message: 'executionLeaseId 必须是有效 UUID',
        status: HttpStatus.BAD_REQUEST,
      });
    }
    if (!command.data.delta) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
        message: '助手文本增量不能为空',
        status: HttpStatus.BAD_REQUEST,
      });
    }
  }

  /** 抛出 Run 不存在的稳定错误。 */
  private throwRunNotFound(): never {
    throw new BusinessException({
      code: API_ERROR_CODES.AI_RUN_NOT_FOUND,
      message: 'AI 运行不存在',
      status: HttpStatus.NOT_FOUND,
    });
  }

  /** 拒绝租约不匹配、已过期或状态不再允许的迟到事件。 */
  private throwExecutionLeaseInvalid(): never {
    throw new BusinessException({
      code: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
      message: 'AI 事件写入使用的执行租约已经失效',
      status: HttpStatus.CONFLICT,
    });
  }
}

/** 接受标准 UUID 文本，数据库仍通过 UUID 原生类型执行最终约束。 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
