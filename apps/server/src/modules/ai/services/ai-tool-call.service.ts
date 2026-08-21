/**
 * 本文件负责在 execution lease 保护下持久化真实工具调用的输入、结果摘要和耗时。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import type { AiToolCall } from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  AiRunStatus,
  AiToolCallStatus,
  type AiToolCall as PrismaAiToolCall,
} from '../../../generated/prisma';
import type {
  FinishAiToolCallCommand,
  StartAiToolCallCommand,
} from '../types/ai-state-persistence.types';

@Injectable()
export class AiToolCallService {
  /** 注入数据库以执行租约 fencing 与工具调用记录事务。 */
  constructor(private readonly prisma: PrismaService) {}

  /** 工具开始前保存安全输入快照；租约失效时不允许真正执行工具。 */
  async start(command: StartAiToolCallCommand): Promise<AiToolCall> {
    return this.prisma.$transaction(async (tx) => {
      const fenced = await tx.aiRun.updateMany({
        where: {
          id: command.runId,
          status: AiRunStatus.RUNNING,
          executionLeaseId: command.executionLeaseId,
          executionLeaseExpiresAt: { gt: new Date() },
        },
        data: { updatedAt: new Date() },
      });

      if (fenced.count !== 1) {
        this.throwExecutionLeaseInvalid();
      }

      const record = await tx.aiToolCall.create({
        data: {
          runId: command.runId,
          toolCallId: command.toolCallId,
          sequence: command.sequence,
          toolName: command.toolName,
          input: command.input,
          startedAt: new Date(),
        },
      });

      return this.toAiToolCall(record);
    });
  }

  /** 工具结束后保存受控结果摘要或稳定错误码，并拒绝取消后的迟到结果。 */
  async finish(command: FinishAiToolCallCommand): Promise<AiToolCall> {
    return this.prisma.$transaction(async (tx) => {
      const fenced = await tx.aiRun.updateMany({
        where: {
          id: command.runId,
          status: AiRunStatus.RUNNING,
          executionLeaseId: command.executionLeaseId,
          executionLeaseExpiresAt: { gt: new Date() },
        },
        data: { updatedAt: new Date() },
      });

      if (fenced.count !== 1) {
        this.throwExecutionLeaseInvalid();
      }

      const record = await tx.aiToolCall.update({
        where: {
          runId_toolCallId: {
            runId: command.runId,
            toolCallId: command.toolCallId,
          },
        },
        data: {
          status: command.errorCode
            ? AiToolCallStatus.FAILED
            : AiToolCallStatus.COMPLETED,
          resultSummary: command.resultSummary ?? undefined,
          errorCode: command.errorCode,
          finishedAt: new Date(),
          durationMs: command.durationMs,
        },
      });

      return this.toAiToolCall(record);
    });
  }

  /** 把 Prisma 工具调用映射为不依赖数据库实现的共享契约。 */
  private toAiToolCall(record: PrismaAiToolCall): AiToolCall {
    return {
      id: record.id,
      runId: record.runId,
      toolCallId: record.toolCallId,
      sequence: record.sequence,
      toolName: record.toolName as AiToolCall['toolName'],
      status: record.status,
      input: record.input as AiToolCall['input'],
      resultSummary: record.resultSummary as AiToolCall['resultSummary'],
      errorCode: record.errorCode,
      startedAt: record.startedAt.toISOString(),
      finishedAt: record.finishedAt?.toISOString() ?? null,
      durationMs: record.durationMs,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /** 拒绝租约不匹配、已过期或 Run 已不允许工具结果写入的请求。 */
  private throwExecutionLeaseInvalid(): never {
    throw new BusinessException({
      code: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
      message: 'AI 工具调用使用的执行租约已经失效',
      status: HttpStatus.CONFLICT,
    });
  }
}
