/**
 * 本文件负责第二阶段 AI 追加事件的原子序号分配与按序补拉。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import { AiEventType, Prisma } from '../../../generated/prisma';
import type { AppendAiEventInput } from '../types/ai-persistence.types';
import {
  AiExecutionLeaseService,
  type AiExecutionLeaseInput,
} from './ai-execution-lease.service';

/** 由持有有效执行租约的执行器追加事件时使用的内部输入。 */
type AppendAiExecutionEventInput = AppendAiEventInput & AiExecutionLeaseInput;

/** 已通过 Run 状态事务保证合法性的状态变化事件输入。 */
type AppendAiRunStatusChangedEventInput = {
  /** 发生状态变化的 Run 标识。 */
  runId: string;
  /** 状态变化前的 Run 状态。 */
  fromStatus:
    | 'QUEUED'
    | 'RUNNING'
    | 'WAITING_APPROVAL'
    | 'CANCELLATION_REQUESTED';
  /** 状态变化后的 Run 状态。 */
  toStatus:
    | 'RUNNING'
    | 'CANCELLATION_REQUESTED'
    | 'CANCELLED'
    | 'COMPLETED'
    | 'FAILED';
  /** 取消流程的稳定原因；非取消流程为 null。 */
  cancellationReason: string | null;
  /** 失败流程的稳定原因；非失败流程为 null。 */
  failureReason: string | null;
};

@Injectable()
export class AiEventService {
  /** 注入数据库与执行租约服务，保证执行器追加事件前先经过 fencing。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionLeaseService: AiExecutionLeaseService,
  ) {}

  /** 在调用方事务中验证执行租约、原子分配 Run 内序号并追加一条不可变事件。 */
  async appendExecutionEventInTransaction(
    transaction: Prisma.TransactionClient,
    input: AppendAiExecutionEventInput,
  ) {
    await this.executionLeaseService.assertActiveExecutionLeaseInTransaction(
      transaction,
      input,
    );

    return this.appendEventInTransaction(transaction, input);
  }

  /** 在已完成状态条件更新的控制事务中记录状态变化，不接受执行器自由写入。 */
  async appendRunStatusChangedInTransaction(
    transaction: Prisma.TransactionClient,
    input: AppendAiRunStatusChangedEventInput,
  ) {
    return this.appendEventInTransaction(transaction, {
      runId: input.runId,
      type: 'RUN_STATUS_CHANGED',
      data: {
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        cancellationReason: input.cancellationReason,
        failureReason: input.failureReason,
      },
    });
  }

  /** 在已完成权限或状态 fencing 的前提下写入不可变事件与序号。 */
  private async appendEventInTransaction(
    transaction: Prisma.TransactionClient,
    input: AppendAiEventInput,
  ) {
    const sequence = await this.allocateSequence(transaction, input.runId);

    return transaction.aiEvent.create({
      data: {
        runId: input.runId,
        sequence,
        type: this.toPrismaAiEventType(input.type),
        data: input.data,
      },
    });
  }

  /** 按服务端 sequence 补拉指定 Run 在断线点之后的事件，永不使用前端数组下标。 */
  listAfterSequence(runId: string, afterSequence: number) {
    return this.prisma.aiEvent.findMany({
      where: { runId, sequence: { gt: afterSequence } },
      orderBy: { sequence: 'asc' },
    });
  }

  /** 使用单条 UPDATE … RETURNING 在事务内分配下一个序号，避免 MAX(sequence) 竞争。 */
  private async allocateSequence(
    transaction: Prisma.TransactionClient,
    runId: string,
  ): Promise<number> {
    const rows = await transaction.$queryRaw<{ sequence: number }[]>(Prisma.sql`
      UPDATE "AiRun"
      SET "nextEventSequence" = "nextEventSequence" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${runId}
      RETURNING "nextEventSequence" - 1 AS "sequence"
    `);
    const sequence = rows[0]?.sequence;
    if (sequence !== undefined) {
      return sequence;
    }

    throw new BusinessException({
      code: API_ERROR_CODES.AI_RUN_NOT_FOUND,
      message: 'AI 运行不存在',
      status: HttpStatus.NOT_FOUND,
    });
  }

  /** 将共享事件类型转换为 Prisma 持久化枚举。 */
  private toPrismaAiEventType(type: AppendAiEventInput['type']): AiEventType {
    return type === 'RUN_STATUS_CHANGED'
      ? AiEventType.RUN_STATUS_CHANGED
      : AiEventType.ASSISTANT_TEXT_DELTA;
  }
}
