/**
 * 本文件负责第二阶段 Run 重试、终态收敛和 Thread 活跃指针的一致性事务。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client-runtime-utils';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import { AiRunStatus, Prisma } from '../../../generated/prisma';
import { assertAiRunStatusTransition } from '../state/ai-state-transition';
import type {
  AiThreadRunCreationResult,
  RetryAiRunInput,
} from '../types/ai-persistence.types';
import {
  assertAiRequiredText,
  createAiRequestFingerprint,
} from './ai-persistence.utils';
import {
  AiExecutionLeaseService,
  type AiExecutionLeaseInput,
  type ClaimedAiRunExecutionLease,
} from './ai-execution-lease.service';
import { AiQueueService } from './ai-queue.service';

@Injectable()
export class AiRunService {
  /** 注入数据库、队列和租约服务，保证重试、领取与续租遵守同一持久化约束。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: AiQueueService,
    private readonly executionLeaseService: AiExecutionLeaseService,
  ) {}

  /**
   * 原子领取一个仍处于 QUEUED 的 Run，并为唯一成功的执行器签发短期租约。
   * 返回 null 表示 Run 不存在、已被领取或已不再可执行；调用方不得据此再次启动执行器。
   */
  async claimQueuedRun(
    runId: string,
  ): Promise<ClaimedAiRunExecutionLease | null> {
    assertAiRunStatusTransition(AiRunStatus.QUEUED, AiRunStatus.RUNNING);
    return this.executionLeaseService.claimQueuedRun(runId);
  }

  /** 仅允许当前有效执行器延长自己的 RUNNING 租约。 */
  async renewExecutionLease(input: AiExecutionLeaseInput): Promise<Date> {
    return this.executionLeaseService.renewExecutionLease(input);
  }

  /** 为已取消或失败的 Run 创建关联的新 Run，并在重试作用域内支持幂等重放。 */
  async retryRun(input: RetryAiRunInput): Promise<AiThreadRunCreationResult> {
    assertAiRequiredText(input.runId, 'Run 标识');
    assertAiRequiredText(input.idempotencyKey, '幂等键');
    const requestFingerprint = createAiRequestFingerprint(input.runId);
    const existing = await this.findRetryReplay(
      input.runId,
      input.idempotencyKey,
    );
    if (existing) {
      return this.resolveRetryReplay(
        existing,
        requestFingerprint,
        input.ownerUserId,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const concurrent = await tx.aiRun.findFirst({
          where: {
            retryOfRunId: input.runId,
            retryIdempotencyKey: input.idempotencyKey,
          },
          include: { thread: { select: { ownerUserId: true } } },
        });
        if (concurrent) {
          return this.resolveRetryReplay(
            concurrent,
            requestFingerprint,
            input.ownerUserId,
          );
        }

        const oldRun = await tx.aiRun.findFirst({
          where: {
            id: input.runId,
            thread: { ownerUserId: input.ownerUserId },
          },
          select: {
            id: true,
            threadId: true,
            userMessageId: true,
            status: true,
            modelRole: true,
          },
        });
        if (!oldRun) {
          throw this.createRunNotFoundException();
        }
        if (
          oldRun.status !== AiRunStatus.CANCELLED &&
          oldRun.status !== AiRunStatus.FAILED
        ) {
          throw this.createRunNotRetryableException();
        }
        const thread = await this.lockThreadForRetry(
          tx,
          oldRun.threadId,
          input.ownerUserId,
        );
        if (!thread) {
          throw this.createRunNotFoundException();
        }
        const lockedReplay = await tx.aiRun.findFirst({
          where: {
            retryOfRunId: input.runId,
            retryIdempotencyKey: input.idempotencyKey,
          },
          include: { thread: { select: { ownerUserId: true } } },
        });
        if (lockedReplay) {
          return this.resolveRetryReplay(
            lockedReplay,
            requestFingerprint,
            input.ownerUserId,
          );
        }
        if (thread.activeRunId) {
          throw this.createThreadRunActiveException();
        }

        const run = await tx.aiRun.create({
          data: {
            threadId: oldRun.threadId,
            userMessageId: oldRun.userMessageId,
            retryOfRunId: oldRun.id,
            retryIdempotencyKey: input.idempotencyKey,
            retryRequestFingerprint: requestFingerprint,
            status: AiRunStatus.QUEUED,
            modelRole: oldRun.modelRole,
          },
        });
        await tx.aiThread.update({
          where: { id: thread.id },
          data: { activeRunId: run.id },
        });

        return {
          threadId: oldRun.threadId,
          messageId: oldRun.userMessageId,
          runId: run.id,
          replayed: false,
        };
      });
    } catch (error) {
      if (!this.isUniqueConstraintViolation(error)) {
        throw error;
      }

      const concurrent = await this.findRetryReplay(
        input.runId,
        input.idempotencyKey,
      );
      if (concurrent) {
        return this.resolveRetryReplay(
          concurrent,
          requestFingerprint,
          input.ownerUserId,
        );
      }

      const oldRun = await this.prisma.aiRun.findFirst({
        where: { id: input.runId, thread: { ownerUserId: input.ownerUserId } },
        select: { thread: { select: { activeRunId: true } } },
      });
      if (oldRun?.thread.activeRunId) {
        throw this.createThreadRunActiveException();
      }
      throw error;
    }
  }

  /** 查询同一旧 Run 和幂等键已经创建过的重试记录。 */
  private findRetryReplay(runId: string, idempotencyKey: string) {
    return this.prisma.aiRun.findFirst({
      where: { retryOfRunId: runId, retryIdempotencyKey: idempotencyKey },
      include: { thread: { select: { ownerUserId: true } } },
    });
  }

  /** 验证重试幂等作用域与请求指纹，并返回既有 Run 标识。 */
  private resolveRetryReplay(
    run: Awaited<ReturnType<AiRunService['findRetryReplay']>>,
    requestFingerprint: string,
    ownerUserId: number,
  ): AiThreadRunCreationResult {
    if (!run || run.thread.ownerUserId !== ownerUserId) {
      throw this.createRunNotFoundException();
    }
    if (run.retryRequestFingerprint !== requestFingerprint) {
      throw this.createIdempotencyConflictException();
    }

    return {
      threadId: run.threadId,
      messageId: run.userMessageId,
      runId: run.id,
      replayed: true,
    };
  }

  /** 锁定 Thread 行后再创建重试 Run，避免不同重试请求绕过单 Run 门禁并相互死锁。 */
  private async lockThreadForRetry(
    transaction: Prisma.TransactionClient,
    threadId: string,
    ownerUserId: number,
  ): Promise<{ id: string; activeRunId: string | null } | null> {
    const rows = await transaction.$queryRaw<
      Array<{ id: string; activeRunId: string | null }>
    >(Prisma.sql`
      SELECT "id", "activeRunId"
      FROM "AiThread"
      WHERE "id" = ${threadId} AND "ownerUserId" = ${ownerUserId}
      FOR UPDATE
    `);

    return rows[0] ?? null;
  }

  /** 判断异常是否由数据库唯一约束触发，供并发重试请求重放使用。 */
  private isUniqueConstraintViolation(
    error: unknown,
  ): error is PrismaClientKnownRequestError {
    return (
      error instanceof PrismaClientKnownRequestError && error.code === 'P2002'
    );
  }

  /** 创建不泄露其他用户 Run 存在性的未找到异常。 */
  private createRunNotFoundException(): BusinessException {
    return new BusinessException({
      code: API_ERROR_CODES.AI_RUN_NOT_FOUND,
      message: 'AI 运行不存在或无权访问',
      status: HttpStatus.NOT_FOUND,
    });
  }

  /** 创建不允许重试当前状态 Run 的稳定冲突异常。 */
  private createRunNotRetryableException(): BusinessException {
    return new BusinessException({
      code: API_ERROR_CODES.AI_RUN_NOT_RETRYABLE,
      message: '只有已取消或失败的 AI 运行可以重试',
      status: HttpStatus.CONFLICT,
    });
  }

  /** 创建单 Thread 已有活跃 Run 时的稳定冲突异常。 */
  private createThreadRunActiveException(): BusinessException {
    return new BusinessException({
      code: API_ERROR_CODES.AI_THREAD_RUN_ACTIVE,
      message: '当前 AI 会话仍有正在处理的请求',
      status: HttpStatus.CONFLICT,
    });
  }

  /** 创建同一幂等键被不同请求正文复用时的稳定冲突异常。 */
  private createIdempotencyConflictException(): BusinessException {
    return new BusinessException({
      code: API_ERROR_CODES.AI_IDEMPOTENCY_CONFLICT,
      message: '同一幂等键不能用于不同的重试请求',
      status: HttpStatus.CONFLICT,
    });
  }
}
