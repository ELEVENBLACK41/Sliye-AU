/**
 * 本文件负责第二阶段 AI 追加事件的原子序号分配与按序补拉。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import { AiEventType, Prisma } from '../../../generated/prisma';
import type { AppendAiEventInput } from '../types/ai-persistence.types';

@Injectable()
export class AiEventService {
  /** 注入唯一的 Prisma 数据访问服务。 */
  constructor(private readonly prisma: PrismaService) {}

  /** 在调用方提供的事务中原子分配 Run 内序号并追加一条不可变事件。 */
  async appendInTransaction(
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
