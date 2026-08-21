/**
 * 本文件负责批量对账已过期的 AI 执行租约。
 * 过期 Run 不会被静默续跑，而是收敛为失败并释放 Thread 单 Run 门禁。
 */

import {
  HttpStatus,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  type AiRun as PrismaAiRun,
  AiRunFailureReason,
  AiRunStatus,
  type Prisma,
} from '../../../generated/prisma';
import type {
  ReconcileExpiredAiRunsCommand,
  ReconcileExpiredAiRunsResult,
} from '../types/ai-state-persistence.types';

/** 单次对账允许处理的最大 Run 数，避免维护任务形成无限事务压力。 */
const MAX_RECONCILIATION_BATCH_SIZE = 100;
/** 第一版常驻 Nest 进程的过期租约巡检间隔。 */
const RECONCILIATION_INTERVAL_MILLISECONDS = 30_000;

@Injectable()
export class AiRunReconciliationService
  implements OnModuleInit, OnModuleDestroy
{
  /** 周期性恢复失败只写脱敏错误摘要，不记录连接串或业务正文。 */
  private readonly logger = new Logger(AiRunReconciliationService.name);
  /** 常驻进程使用的过期租约巡检定时器。 */
  private reconciliationTimer?: ReturnType<typeof setInterval>;
  /** 防止单实例内慢批次和下一个定时周期重叠。 */
  private reconciliationRunning = false;

  /** 注入数据库以读取并条件收敛过期 Run。 */
  constructor(private readonly prisma: PrismaService) {}

  /** 服务启动时先收敛进程异常遗留的过期 Run，再启动周期巡检。 */
  async onModuleInit(): Promise<void> {
    await this.runScheduledReconciliation(new Date());
    this.reconciliationTimer = setInterval(() => {
      void this.runScheduledReconciliation(new Date()).catch(() => {
        this.logger.error('AI 过期执行租约对账失败，将在下个周期重试');
      });
    }, RECONCILIATION_INTERVAL_MILLISECONDS);
    this.reconciliationTimer.unref?.();
  }

  /** 模块销毁时停止巡检，避免测试或优雅停机残留定时句柄。 */
  onModuleDestroy(): void {
    if (this.reconciliationTimer) {
      clearInterval(this.reconciliationTimer);
      this.reconciliationTimer = undefined;
    }
  }

  /** 按过期时间顺序对账一批 Run；并发对账者只会有一个成功收敛。 */
  async reconcileExpiredRuns(
    command: ReconcileExpiredAiRunsCommand,
  ): Promise<ReconcileExpiredAiRunsResult> {
    this.assertCommand(command);
    const candidates = await this.prisma.aiRun.findMany({
      where: {
        status: {
          in: [AiRunStatus.RUNNING, AiRunStatus.CANCELLATION_REQUESTED],
        },
        executionLeaseId: { not: null },
        executionLeaseExpiresAt: { lte: command.now },
      },
      select: {
        id: true,
        status: true,
        executionLeaseId: true,
      },
      orderBy: { executionLeaseExpiresAt: 'asc' },
      take: command.batchSize,
    });
    const reconciledRunIds: string[] = [];

    for (const candidate of candidates) {
      if (
        candidate.executionLeaseId &&
        (await this.reconcileCandidate(
          candidate.id,
          candidate.status,
          candidate.executionLeaseId,
          command.now,
        ))
      ) {
        reconciledRunIds.push(candidate.id);
      }
    }

    return { reconciledRunIds };
  }

  /** 启动或定时巡检时按受控批次处理，直到当前快照不再填满一批。 */
  private async reconcileUntilBatchDrained(now: Date): Promise<void> {
    let reconciledCount: number;
    do {
      const result = await this.reconcileExpiredRuns({
        now,
        batchSize: MAX_RECONCILIATION_BATCH_SIZE,
      });
      reconciledCount = result.reconciledRunIds.length;
    } while (reconciledCount === MAX_RECONCILIATION_BATCH_SIZE);
  }

  /** 串行执行当前实例的启动或周期对账，多实例仍由数据库比较更新裁决。 */
  private async runScheduledReconciliation(now: Date): Promise<void> {
    if (this.reconciliationRunning) {
      return;
    }
    this.reconciliationRunning = true;
    try {
      await this.reconcileUntilBatchDrained(now);
    } finally {
      this.reconciliationRunning = false;
    }
  }

  /** 通过状态、租约和过期时间比较更新，确保同一候选只收敛一次。 */
  private async reconcileCandidate(
    runId: string,
    fromStatus: AiRunStatus,
    executionLeaseId: string,
    now: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const reconciled = await tx.aiRun.updateMany({
        where: {
          id: runId,
          status: fromStatus,
          executionLeaseId,
          executionLeaseExpiresAt: { lte: now },
        },
        data: {
          status: AiRunStatus.FAILED,
          failureReason: AiRunFailureReason.EXECUTION_LEASE_EXPIRED,
          failureCode: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
          executionLeaseId: null,
          executionLeaseExpiresAt: null,
          finishedAt: now,
          nextEventSequence: { increment: 1 },
        },
      });

      if (reconciled.count !== 1) {
        return false;
      }

      const run = await tx.aiRun.findUniqueOrThrow({ where: { id: runId } });
      await this.appendFailureEvent(tx, run, fromStatus);
      await tx.aiThread.updateMany({
        where: { id: run.threadId, activeRunId: run.id },
        data: { activeRunId: null },
      });
      return true;
    });
  }

  /** 为过期收敛写入与最终 Run 状态一致的追加事件。 */
  private async appendFailureEvent(
    tx: Prisma.TransactionClient,
    run: PrismaAiRun,
    fromStatus: AiRunStatus,
  ): Promise<void> {
    await tx.aiEvent.create({
      data: {
        runId: run.id,
        sequence: run.nextEventSequence - 1,
        type: 'RUN_STATUS_CHANGED',
        payload: {
          fromStatus,
          toStatus: AiRunStatus.FAILED,
          cancellationReason: run.cancellationReason,
          failureReason: AiRunFailureReason.EXECUTION_LEASE_EXPIRED,
        },
      },
    });
  }

  /** 校验对账时间和受控批次大小。 */
  private assertCommand(command: ReconcileExpiredAiRunsCommand): void {
    if (Number.isNaN(command.now.getTime())) {
      this.throwValidationError('now', '对账时间必须是有效日期');
    }
    if (
      !Number.isInteger(command.batchSize) ||
      command.batchSize <= 0 ||
      command.batchSize > MAX_RECONCILIATION_BATCH_SIZE
    ) {
      this.throwValidationError(
        'batchSize',
        `单次对账数量必须介于 1 到 ${MAX_RECONCILIATION_BATCH_SIZE}`,
      );
    }
  }

  /** 抛出稳定的对账命令校验错误。 */
  private throwValidationError(field: string, message: string): never {
    throw new BusinessException({
      code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
      message,
      status: HttpStatus.BAD_REQUEST,
      details: [{ field, message, rule: 'AI_RUN_RECONCILIATION_VALIDATION' }],
    });
  }
}
