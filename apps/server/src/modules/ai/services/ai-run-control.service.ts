/**
 * 本文件负责 AI Run 的终态收敛、停止请求、取消确认与过期租约对账。
 * 所有会释放 Thread 单 Run 门禁的路径均在同一 PostgreSQL 事务内领取下一条排队消息。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import { AiRunStatus, Prisma } from '../../../generated/prisma';
import { assertAiRunStatusTransition } from '../state/ai-state-transition';
import type {
  AiRunStopResult,
  CompleteAiRunInput,
  RequestAiRunStopInput,
} from '../types/ai-persistence.types';
import { AiAssistantMessageService } from './ai-assistant-message.service';
import { AiEventService } from './ai-event.service';
import { AiExecutionLeaseService } from './ai-execution-lease.service';
import { AiQueueService } from './ai-queue.service';

/** 调整方向在已锁定 Thread 的事务内取消当前 Run 时所需的内部输入。 */
export type RequestActiveRunCancellationInput = {
  /** 已持有行锁的 Thread 标识。 */
  threadId: string;
  /** Thread 当前活跃 Run 标识；空值表示无需取消。 */
  activeRunId: string | null;
  /** 用户通过调整方向触发的稳定取消原因。 */
  cancellationReason: 'USER_REDIRECTED';
};

/** 过期租约对账的批次处理结果。 */
export type ReconcileExpiredAiRunsResult = {
  /** 本轮扫描到的候选 Run 数量。 */
  scannedRunCount: number;
  /** 真正发生终态收敛的 Run 数量。 */
  reconciledRunCount: number;
};

@Injectable()
export class AiRunControlService {
  /** 注入状态事件、队列、租约和助手消息服务，确保状态变更与最终正文共用同一事务边界。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: AiEventService,
    private readonly queueService: AiQueueService,
    private readonly executionLeaseService: AiExecutionLeaseService,
    private readonly assistantMessageService: AiAssistantMessageService,
  ) {}

  /** 仅允许当前有效执行器将 RUNNING Run 收敛为完成或失败终态。 */
  async completeRun(input: CompleteAiRunInput): Promise<AiRunStopResult> {
    return this.prisma.$transaction(async (transaction) => {
      const run = await this.findOwnedRun(
        transaction,
        input.runId,
        input.ownerUserId,
      );
      const thread = await this.queueService.lockThread(
        transaction,
        run.threadId,
        input.ownerUserId,
      );
      if (!thread) {
        throw this.createRunNotFoundException();
      }
      assertAiRunStatusTransition(run.status, input.status);
      await this.executionLeaseService.assertActiveExecutionLeaseInTransaction(
        transaction,
        { runId: run.id, executionLeaseId: input.executionLeaseId },
      );
      const completed = await transaction.aiRun.updateMany({
        where: {
          id: run.id,
          status: AiRunStatus.RUNNING,
          executionLeaseId: input.executionLeaseId,
          executionLeaseExpiresAt: { gt: new Date() },
        },
        data: {
          status: input.status,
          executionLeaseId: null,
          executionLeaseExpiresAt: null,
          cancellationReason: null,
          failureReason: input.failureReason,
          failureCode: input.failureCode,
          finishedAt: new Date(),
        },
      });
      if (completed.count !== 1) {
        throw this.createExecutionLeaseInvalidException();
      }
      if (
        input.assistantMessageContent !== undefined &&
        input.assistantMessageContent !== null
      ) {
        await this.assistantMessageService.writeFinalContentInTransaction(
          transaction,
          {
            runId: run.id,
            threadId: run.threadId,
            content: input.assistantMessageContent,
          },
        );
      }

      return this.settleTerminalRunInTransaction(transaction, {
        runId: run.id,
        threadId: run.threadId,
        fromStatus: AiRunStatus.RUNNING,
        toStatus: input.status,
        cancellationReason: null,
        failureReason: input.failureReason,
      });
    });
  }

  /** 请求停止一个用户拥有的 Run；执行中的 Run 先失效租约，再等待取消确认或对账收敛。 */
  async requestStop(input: RequestAiRunStopInput): Promise<AiRunStopResult> {
    return this.prisma.$transaction(async (transaction) => {
      const run = await this.findOwnedRun(
        transaction,
        input.runId,
        input.ownerUserId,
      );
      const thread = await this.queueService.lockThread(
        transaction,
        run.threadId,
        input.ownerUserId,
      );
      if (!thread) {
        throw this.createRunNotFoundException();
      }

      return this.requestCancellationInLockedThread(
        transaction,
        run,
        input.cancellationReason,
      );
    });
  }

  /** 确认已停止的执行器不再写入，并把取消请求唯一收敛为 CANCELLED。 */
  async confirmCancellation(
    ownerUserId: number,
    runId: string,
  ): Promise<AiRunStopResult> {
    return this.prisma.$transaction(async (transaction) => {
      const run = await this.findOwnedRun(transaction, runId, ownerUserId);
      const thread = await this.queueService.lockThread(
        transaction,
        run.threadId,
        ownerUserId,
      );
      if (!thread) {
        throw this.createRunNotFoundException();
      }
      if (run.status === AiRunStatus.CANCELLED) {
        return { runId: run.id, status: 'CANCELLED', nextRunId: null };
      }
      if (run.status !== AiRunStatus.CANCELLATION_REQUESTED) {
        throw this.createRunInvalidTransitionException();
      }

      const cancelled = await transaction.aiRun.updateMany({
        where: { id: run.id, status: AiRunStatus.CANCELLATION_REQUESTED },
        data: {
          status: AiRunStatus.CANCELLED,
          executionLeaseId: null,
          executionLeaseExpiresAt: null,
          finishedAt: new Date(),
        },
      });
      if (cancelled.count !== 1) {
        throw this.createRunInvalidTransitionException();
      }

      return this.settleTerminalRunInTransaction(transaction, {
        runId: run.id,
        threadId: run.threadId,
        fromStatus: AiRunStatus.CANCELLATION_REQUESTED,
        toStatus: AiRunStatus.CANCELLED,
        cancellationReason: run.cancellationReason,
        failureReason: null,
      });
    });
  }

  /**
   * 在 Thread 已锁定的事务中处理调整方向：先持久化最新消息，再使旧 Run 进入有序取消。
   * 如果旧 Run 尚未被执行器领取，会直接取消并领取最新方向消息；已运行时只保留取消请求。
   */
  async requestActiveRunCancellationInTransaction(
    transaction: Prisma.TransactionClient,
    input: RequestActiveRunCancellationInput,
  ): Promise<AiRunStopResult | null> {
    if (!input.activeRunId) {
      return null;
    }
    const run = await transaction.aiRun.findUnique({
      where: { id: input.activeRunId },
      select: {
        id: true,
        threadId: true,
        status: true,
        cancellationReason: true,
      },
    });
    if (!run || run.threadId !== input.threadId) {
      return null;
    }

    return this.requestCancellationInLockedThread(
      transaction,
      run,
      input.cancellationReason,
    );
  }

  /** 扫描并确定性收敛租约已过期的 Run；不尝试在其他进程接管或续跑旧执行器。 */
  async reconcileExpiredRuns(
    limit = 100,
  ): Promise<ReconcileExpiredAiRunsResult> {
    const now = new Date();
    const candidates = await this.prisma.aiRun.findMany({
      where: {
        status: {
          in: [AiRunStatus.RUNNING, AiRunStatus.CANCELLATION_REQUESTED],
        },
        executionLeaseExpiresAt: { lte: now },
      },
      orderBy: { executionLeaseExpiresAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    let reconciledRunCount = 0;
    for (const candidate of candidates) {
      if (await this.reconcileExpiredRun(candidate.id, now)) {
        reconciledRunCount += 1;
      }
    }

    return { scannedRunCount: candidates.length, reconciledRunCount };
  }

  /** 在单个 Run 的 Thread 锁内判断租约仍已过期，再收敛为失败或取消终态。 */
  private async reconcileExpiredRun(
    runId: string,
    now: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const run = await transaction.aiRun.findUnique({
        where: { id: runId },
        select: {
          id: true,
          threadId: true,
          status: true,
          cancellationReason: true,
          executionLeaseExpiresAt: true,
        },
      });
      if (
        !run ||
        !run.executionLeaseExpiresAt ||
        run.executionLeaseExpiresAt > now ||
        (run.status !== AiRunStatus.RUNNING &&
          run.status !== AiRunStatus.CANCELLATION_REQUESTED)
      ) {
        return false;
      }
      const thread = await this.queueService.lockThreadForExecution(
        transaction,
        run.threadId,
      );
      if (!thread) {
        return false;
      }
      const toStatus =
        run.status === AiRunStatus.CANCELLATION_REQUESTED
          ? AiRunStatus.CANCELLED
          : AiRunStatus.FAILED;
      const reconciled = await transaction.aiRun.updateMany({
        where: {
          id: run.id,
          status: run.status,
          executionLeaseExpiresAt: { lte: now },
        },
        data: {
          status: toStatus,
          executionLeaseId: null,
          executionLeaseExpiresAt: null,
          failureReason:
            toStatus === AiRunStatus.FAILED ? 'EXECUTION_LEASE_EXPIRED' : null,
          failureCode:
            toStatus === AiRunStatus.FAILED
              ? API_ERROR_CODES.AI_EXECUTION_LEASE_EXPIRED
              : null,
          finishedAt: new Date(),
        },
      });
      if (reconciled.count !== 1) {
        return false;
      }

      await this.settleTerminalRunInTransaction(transaction, {
        runId: run.id,
        threadId: run.threadId,
        fromStatus: run.status,
        toStatus,
        cancellationReason:
          toStatus === AiRunStatus.CANCELLED ? run.cancellationReason : null,
        failureReason:
          toStatus === AiRunStatus.FAILED ? 'EXECUTION_LEASE_EXPIRED' : null,
      });
      return true;
    });
  }

  /** 在已锁定 Thread 的前提下将当前 Run 变为取消请求，或立即取消尚未领取的排队 Run。 */
  private async requestCancellationInLockedThread(
    transaction: Prisma.TransactionClient,
    run: {
      id: string;
      threadId: string;
      status: AiRunStatus;
      cancellationReason: string | null;
    },
    cancellationReason: 'USER_REQUESTED' | 'USER_REDIRECTED',
  ): Promise<AiRunStopResult> {
    if (run.status === AiRunStatus.CANCELLED) {
      return { runId: run.id, status: 'CANCELLED', nextRunId: null };
    }
    if (
      run.status === AiRunStatus.COMPLETED ||
      run.status === AiRunStatus.FAILED
    ) {
      return { runId: run.id, status: run.status, nextRunId: null };
    }
    if (run.status === AiRunStatus.CANCELLATION_REQUESTED) {
      return {
        runId: run.id,
        status: 'CANCELLATION_REQUESTED',
        nextRunId: null,
      };
    }
    if (run.status === AiRunStatus.QUEUED) {
      assertAiRunStatusTransition(AiRunStatus.QUEUED, AiRunStatus.CANCELLED);
      const cancelled = await transaction.aiRun.updateMany({
        where: { id: run.id, status: AiRunStatus.QUEUED },
        data: {
          status: AiRunStatus.CANCELLED,
          executionLeaseId: null,
          executionLeaseExpiresAt: null,
          cancellationReason,
          finishedAt: new Date(),
        },
      });
      if (cancelled.count !== 1) {
        throw this.createRunInvalidTransitionException();
      }

      return this.settleTerminalRunInTransaction(transaction, {
        runId: run.id,
        threadId: run.threadId,
        fromStatus: AiRunStatus.QUEUED,
        toStatus: AiRunStatus.CANCELLED,
        cancellationReason,
        failureReason: null,
      });
    }

    assertAiRunStatusTransition(run.status, AiRunStatus.CANCELLATION_REQUESTED);
    const requested = await transaction.aiRun.updateMany({
      where: { id: run.id, status: run.status },
      data: {
        status: AiRunStatus.CANCELLATION_REQUESTED,
        cancellationReason,
        executionLeaseId: null,
        executionLeaseExpiresAt: new Date(),
      },
    });
    if (requested.count !== 1) {
      throw this.createRunInvalidTransitionException();
    }
    await this.eventService.appendRunStatusChangedInTransaction(transaction, {
      runId: run.id,
      fromStatus: run.status,
      toStatus: AiRunStatus.CANCELLATION_REQUESTED,
      cancellationReason,
      failureReason: null,
    });

    return {
      runId: run.id,
      status: 'CANCELLATION_REQUESTED',
      nextRunId: null,
    };
  }

  /** 清除当前 Thread 活跃指针、领取唯一队首并记录已发生的终态变化。 */
  private async settleTerminalRunInTransaction(
    transaction: Prisma.TransactionClient,
    input: {
      runId: string;
      threadId: string;
      fromStatus: Extract<
        AiRunStatus,
        'QUEUED' | 'RUNNING' | 'WAITING_APPROVAL' | 'CANCELLATION_REQUESTED'
      >;
      toStatus: Extract<AiRunStatus, 'CANCELLED' | 'COMPLETED' | 'FAILED'>;
      cancellationReason: string | null;
      failureReason: string | null;
    },
  ): Promise<AiRunStopResult> {
    await transaction.aiThread.updateMany({
      where: { id: input.threadId, activeRunId: input.runId },
      data: { activeRunId: null },
    });
    const nextRun = await this.queueService.claimNextQueuedMessage(
      transaction,
      input.threadId,
    );
    await this.eventService.appendRunStatusChangedInTransaction(transaction, {
      runId: input.runId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      cancellationReason: input.cancellationReason,
      failureReason: input.failureReason,
    });

    return {
      runId: input.runId,
      status: input.toStatus,
      nextRunId: nextRun?.runId ?? null,
    };
  }

  /** 查询当前用户拥有的 Run，避免控制接口泄漏其他用户的 Run 是否存在。 */
  private async findOwnedRun(
    transaction: Prisma.TransactionClient,
    runId: string,
    ownerUserId: number,
  ): Promise<{
    id: string;
    threadId: string;
    status: AiRunStatus;
    cancellationReason: string | null;
  }> {
    const run = await transaction.aiRun.findFirst({
      where: { id: runId, thread: { ownerUserId } },
      select: {
        id: true,
        threadId: true,
        status: true,
        cancellationReason: true,
      },
    });
    if (!run) {
      throw this.createRunNotFoundException();
    }

    return run;
  }

  /** 创建状态已被并发请求改变或当前转换非法时的稳定冲突。 */
  private createRunInvalidTransitionException(): BusinessException {
    return new BusinessException({
      code: API_ERROR_CODES.AI_RUN_INVALID_STATUS_TRANSITION,
      message: 'AI 运行状态已被其他请求改变，请刷新后重试',
      status: HttpStatus.CONFLICT,
    });
  }

  /** 创建不泄露其他用户 Run 存在性的未找到异常。 */
  private createRunNotFoundException(): BusinessException {
    return new BusinessException({
      code: API_ERROR_CODES.AI_RUN_NOT_FOUND,
      message: 'AI 运行不存在或无权访问',
      status: HttpStatus.NOT_FOUND,
    });
  }

  /** 创建租约在终态写入前已失效的 fenced 写入冲突。 */
  private createExecutionLeaseInvalidException(): BusinessException {
    return new BusinessException({
      code: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
      message: 'AI 执行租约已失效，请停止当前执行器',
      status: HttpStatus.CONFLICT,
    });
  }
}
