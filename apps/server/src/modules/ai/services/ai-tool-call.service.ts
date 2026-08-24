/**
 * 本文件负责在 execution lease 保护下持久化真实工具调用的输入、结果摘要和耗时。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import type { AiToolCall } from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import {
  AiRunStatus,
  AiSourceDependencyUsage,
  AiToolCallStatus,
  type AiToolCall as PrismaAiToolCall,
} from '../../../generated/prisma';
import type {
  FinishAiToolCallCommand,
  StartAiToolCallCommand,
} from '../types/ai-state-persistence.types';
import { AiThreadScopeService } from './ai-thread-scope.service';

@Injectable()
export class AiToolCallService {
  /** 注入 Thread 范围服务以在同一事务内复核来源、租约与工具状态。 */
  constructor(private readonly threadScopeService: AiThreadScopeService) {}

  /** 工具开始前保存安全输入快照；租约失效时不允许真正执行工具。 */
  async start(command: StartAiToolCallCommand): Promise<AiToolCall> {
    return this.threadScopeService.withAccessibleRun(
      command.authorization,
      command.runId,
      [],
      async (tx, accessible) => {
        if (!accessible.decisionIds.includes(command.input.decisionId)) {
          throw new BusinessException({
            code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
            message: '工具请求的决策不在当前 AI Run 已确认范围内',
            status: HttpStatus.BAD_REQUEST,
          });
        }
        const now = new Date();
        const fenced = await tx.aiRun.updateMany({
          where: {
            id: command.runId,
            status: AiRunStatus.RUNNING,
            executionLeaseId: command.executionLeaseId,
            executionLeaseExpiresAt: { gt: now },
          },
          data: { updatedAt: now },
        });

        if (fenced.count !== 1) {
          this.throwExecutionLeaseInvalid();
        }

        const initialStatus =
          command.status === 'WAITING'
            ? AiToolCallStatus.WAITING
            : AiToolCallStatus.RUNNING;
        let record = await tx.aiToolCall.upsert({
          where: {
            runId_toolCallId: {
              runId: command.runId,
              toolCallId: command.toolCallId,
            },
          },
          create: {
            runId: command.runId,
            toolCallId: command.toolCallId,
            sequence: command.sequence,
            toolName: command.toolName,
            status: initialStatus,
            input: command.input,
            startedAt: initialStatus === AiToolCallStatus.RUNNING ? now : null,
          },
          update: {},
        });

        this.assertSameToolCall(record, command);
        if (
          command.status === 'RUNNING' &&
          record.status === AiToolCallStatus.WAITING
        ) {
          record = await tx.aiToolCall.update({
            where: { id: record.id },
            data: { status: AiToolCallStatus.RUNNING, startedAt: now },
          });
        }

        return this.toAiToolCall(record);
      },
    );
  }

  /** 工具结束后保存受控结果摘要或稳定错误码，并拒绝取消后的迟到结果。 */
  async finish(command: FinishAiToolCallCommand): Promise<AiToolCall> {
    const sourceIds = command.resultSummary?.sourceIds ?? [];
    return this.threadScopeService.withAccessibleRun(
      command.authorization,
      command.runId,
      sourceIds,
      async (tx) => {
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

        const targetStatus = command.errorCode
          ? AiToolCallStatus.FAILED
          : AiToolCallStatus.COMPLETED;
        const finishedAt = new Date();
        const updated = await tx.aiToolCall.updateMany({
          where: {
            runId: command.runId,
            toolCallId: command.toolCallId,
            status: AiToolCallStatus.RUNNING,
          },
          data: {
            status: targetStatus,
            resultSummary: command.resultSummary ?? undefined,
            errorCode: command.errorCode,
            finishedAt,
            durationMs: command.durationMs,
          },
        });
        const record = await tx.aiToolCall.findUnique({
          where: {
            runId_toolCallId: {
              runId: command.runId,
              toolCallId: command.toolCallId,
            },
          },
        });
        if (
          !record ||
          (updated.count !== 1 && record.status !== targetStatus)
        ) {
          this.throwInvalidToolState();
        }
        if (!command.errorCode) {
          await this.threadScopeService.registerSourceDependencies(
            tx,
            command.runId,
            AiSourceDependencyUsage.TOOL_READ,
            sourceIds,
          );
        }

        return this.toAiToolCall(record);
      },
    );
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
      startedAt: record.startedAt?.toISOString() ?? null,
      finishedAt: record.finishedAt?.toISOString() ?? null,
      durationMs: record.durationMs,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /** 拒绝使用同一工具调用 ID 篡改序号、名称或绑定决策的幂等重放。 */
  private assertSameToolCall(
    record: PrismaAiToolCall,
    command: StartAiToolCallCommand,
  ): void {
    const input = record.input as { decisionId?: unknown };
    if (
      record.sequence !== command.sequence ||
      record.toolName !== command.toolName ||
      input.decisionId !== command.input.decisionId
    ) {
      throw new BusinessException({
        code: API_ERROR_CODES.AI_IDEMPOTENCY_CONFLICT,
        message: '同一工具调用 ID 的持久化参数不一致',
        status: HttpStatus.CONFLICT,
      });
    }
  }

  /** 拒绝跳过 RUNNING 或覆盖既有相反终态的工具完成写入。 */
  private throwInvalidToolState(): never {
    throw new BusinessException({
      code: API_ERROR_CODES.AI_RUN_INVALID_STATUS_TRANSITION,
      message: 'AI 工具调用当前状态不允许完成写入',
      status: HttpStatus.CONFLICT,
    });
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
