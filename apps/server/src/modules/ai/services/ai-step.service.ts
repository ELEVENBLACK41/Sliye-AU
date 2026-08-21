/**
 * 本文件负责持久化每一次独立语言模型调用，并原子累加 Run Token 与成本汇总。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client-runtime-utils';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  toAiModelStepRecord,
  toPrismaAiLanguageModelRole,
} from '../ai-state.mapper';
import type {
  AiModelStepRecord,
  RecordAiModelStepCommand,
} from '../types/ai-state-persistence.types';

@Injectable()
export class AiStepService {
  /** 注入数据库以原子保存 Step 并更新 Run 汇总。 */
  constructor(private readonly prisma: PrismaService) {}

  /** 持久化一次模型调用，并把本次 Token 和成本累加到所属 Run。 */
  async recordModelStep(
    command: RecordAiModelStepCommand,
  ): Promise<AiModelStepRecord> {
    this.assertCommand(command);
    const totalTokens = command.inputTokens + command.outputTokens;
    const durationMs =
      command.finishedAt.getTime() - command.startedAt.getTime();

    try {
      const step = await this.prisma.$transaction(async (tx) => {
        const created = await tx.aiStep.create({
          data: {
            runId: command.runId,
            sequence: command.sequence,
            modelRole: toPrismaAiLanguageModelRole(command.modelRole),
            resolvedModelId: command.resolvedModelId,
            provider: command.provider,
            responseId: command.responseId,
            finishReason: command.finishReason,
            inputTokens: command.inputTokens,
            outputTokens: command.outputTokens,
            totalTokens,
            estimatedCostUsd: command.estimatedCostUsd,
            startedAt: command.startedAt,
            finishedAt: command.finishedAt,
            durationMs,
            timeToFirstOutputMs: command.timeToFirstOutputMs,
          },
        });
        await tx.aiRun.update({
          where: { id: command.runId },
          data: {
            modelCallCount: { increment: 1 },
            inputTokens: { increment: command.inputTokens },
            outputTokens: { increment: command.outputTokens },
            totalTokens: { increment: totalTokens },
            estimatedCostUsd: { increment: command.estimatedCostUsd },
          },
        });
        return created;
      });

      return toAiModelStepRecord(step);
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        (error.code === 'P2003' || error.code === 'P2025')
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
          code: API_ERROR_CODES.AI_STEP_SEQUENCE_CONFLICT,
          message: '同一 AI 运行的模型 Step 序号不能重复',
          status: HttpStatus.CONFLICT,
        });
      }
      throw error;
    }
  }

  /** 防御性校验模型 Step 的序号、Token、成本和耗时字段。 */
  private assertCommand(command: RecordAiModelStepCommand): void {
    const durationMs =
      command.finishedAt.getTime() - command.startedAt.getTime();
    const invalidNonNegativeValues = [
      command.inputTokens,
      command.outputTokens,
      command.estimatedCostUsd,
    ].some((value) => !Number.isFinite(value) || value < 0);

    if (!Number.isInteger(command.sequence) || command.sequence <= 0) {
      this.throwValidationError('sequence', '模型 Step 序号必须是正整数');
    }
    if (
      !Number.isInteger(command.inputTokens) ||
      !Number.isInteger(command.outputTokens) ||
      invalidNonNegativeValues
    ) {
      this.throwValidationError(
        'usage',
        '模型 Step 的 Token 和成本必须是非负数',
      );
    }
    if (durationMs < 0) {
      this.throwValidationError(
        'finishedAt',
        '模型 Step 完成时间不能早于开始时间',
      );
    }
    if (
      command.timeToFirstOutputMs !== null &&
      (!Number.isInteger(command.timeToFirstOutputMs) ||
        command.timeToFirstOutputMs < 0 ||
        command.timeToFirstOutputMs > durationMs)
    ) {
      this.throwValidationError(
        'timeToFirstOutputMs',
        '首个输出耗时必须位于模型调用耗时范围内',
      );
    }
    if (
      !command.resolvedModelId.trim() ||
      !command.provider.trim() ||
      !command.finishReason.trim()
    ) {
      this.throwValidationError('model', '模型、提供商和停止原因不能为空');
    }
  }

  /** 抛出稳定的模型 Step 字段校验错误。 */
  private throwValidationError(field: string, message: string): never {
    throw new BusinessException({
      code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
      message,
      status: HttpStatus.BAD_REQUEST,
      details: [{ field, message, rule: 'AI_MODEL_STEP_VALIDATION' }],
    });
  }
}
