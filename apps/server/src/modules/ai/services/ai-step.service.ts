/**
 * 本文件负责持久化一次 Run 内的模型步骤记录。
 * 步骤序号由持有租约的唯一执行器按调用顺序自行递增，数据库以 (runId, sequence)
 * 唯一约束兜底：重复写入视为同一步骤的幂等重放，不会产生第二条记录。
 * 本服务只保存受控的模型元数据与 Token 摘要，不保存提示词、消息正文或供应商原始负载。
 */

import { Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client-runtime-utils';
import { PrismaService } from '../../../database/prisma.service';
import type { RecordAiStepInput } from '../types/ai-persistence.types';
import { AiExecutionLeaseService } from './ai-execution-lease.service';

/** 一条已持久化模型步骤的稳定标识。 */
export type RecordedAiStep = {
  /** 步骤记录主键，供同一步骤内的工具调用关联使用。 */
  stepId: string;
  /** Run 内的模型步骤序号。 */
  sequence: number;
};

@Injectable()
export class AiStepService {
  /** 注入数据库与执行租约服务，保证步骤写入同样受 fencing 保护。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionLeaseService: AiExecutionLeaseService,
  ) {}

  /** 在校验执行租约后写入一次模型步骤；同一序号重复写入返回既有记录。 */
  async recordStep(input: RecordAiStepInput): Promise<RecordedAiStep> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await this.executionLeaseService.assertActiveExecutionLeaseInTransaction(
          transaction,
          { runId: input.runId, executionLeaseId: input.executionLeaseId },
        );
        const step = await transaction.aiStep.create({
          data: {
            runId: input.runId,
            sequence: input.sequence,
            resolvedModelId: input.resolvedModelId,
            finishReason: input.finishReason,
            inputTokens: input.inputTokens,
            outputTokens: input.outputTokens,
            totalTokens: input.totalTokens,
            startedAt: input.startedAt,
            finishedAt: input.finishedAt,
          },
          select: { id: true, sequence: true },
        });

        return { stepId: step.id, sequence: step.sequence };
      });
    } catch (error) {
      if (!this.isUniqueConstraintViolation(error)) {
        throw error;
      }

      return this.findExistingStep(input.runId, input.sequence);
    }
  }

  /** 查询同一 Run 内已经写入的同序号步骤，用于并发或重放场景返回稳定结果。 */
  private async findExistingStep(
    runId: string,
    sequence: number,
  ): Promise<RecordedAiStep> {
    const existing = await this.prisma.aiStep.findUnique({
      where: { runId_sequence: { runId, sequence } },
      select: { id: true, sequence: true },
    });
    if (!existing) {
      throw new Error('AI 模型步骤写入冲突后仍找不到既有记录。');
    }

    return { stepId: existing.id, sequence: existing.sequence };
  }

  /** 判断异常是否由数据库唯一约束触发。 */
  private isUniqueConstraintViolation(
    error: unknown,
  ): error is PrismaClientKnownRequestError {
    return (
      error instanceof PrismaClientKnownRequestError && error.code === 'P2002'
    );
  }
}
