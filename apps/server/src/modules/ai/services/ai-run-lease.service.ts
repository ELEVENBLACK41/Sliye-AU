/**
 * 本文件负责 AI Run 的原子领取和执行租约续期。
 * executionLeaseId 是后续事件、Step、消息和终态写入必须匹配的 fencing token。
 */

import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import { AiRunStatus, type Prisma } from '../../../generated/prisma';
import { toAiRun } from '../ai-state.mapper';
import type {
  AiRunLeaseResult,
  ClaimAiRunCommand,
  RenewAiRunLeaseCommand,
} from '../types/ai-state-persistence.types';

/** 第一版租约最短允许一秒，避免零时长租约制造不可解释竞态。 */
const MIN_EXECUTION_LEASE_MILLISECONDS = 1_000;
/** 第一版单次租约最多五分钟，执行器必须通过续租证明存活。 */
const MAX_EXECUTION_LEASE_MILLISECONDS = 5 * 60 * 1_000;
/** 接受标准 UUID 文本，数据库仍通过 UUID 原生类型执行最终约束。 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AiRunLeaseService {
  /** 注入数据库以执行原子领取和续租。 */
  constructor(private readonly prisma: PrismaService) {}

  /** 原子把一个排队中 Run 领取为运行态，并签发唯一 UUID 执行租约。 */
  async claim(command: ClaimAiRunCommand): Promise<AiRunLeaseResult> {
    this.assertUuid(command.runId, 'runId');
    this.assertLeaseDuration(command.leaseDurationMs);
    const now = new Date();
    const executionLeaseId = randomUUID();
    const executionLeaseExpiresAt = new Date(
      now.getTime() + command.leaseDurationMs,
    );

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.aiRun.updateMany({
        where: {
          id: command.runId,
          status: AiRunStatus.QUEUED,
          executionLeaseId: null,
          activeForThread: { activeRunId: command.runId },
        },
        data: {
          status: AiRunStatus.RUNNING,
          executionLeaseId,
          executionLeaseExpiresAt,
          startedAt: now,
          nextEventSequence: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        await this.assertRunExists(tx, command.runId);
        this.throwExecutionLeaseInvalid('AI Run 已被其他执行器领取或不再排队');
      }

      const run = await this.loadRun(tx, command.runId);
      await tx.aiEvent.create({
        data: {
          runId: run.id,
          sequence: run.nextEventSequence - 1,
          type: 'RUN_STATUS_CHANGED',
          payload: {
            fromStatus: AiRunStatus.QUEUED,
            toStatus: AiRunStatus.RUNNING,
            cancellationReason: null,
            failureReason: null,
          },
        },
      });

      return { run: toAiRun(run), executionLeaseId };
    });
  }

  /** 仅允许当前且尚未过期的执行租约从当前时刻继续延长。 */
  async renewLease(command: RenewAiRunLeaseCommand): Promise<AiRunLeaseResult> {
    this.assertUuid(command.runId, 'runId');
    this.assertUuid(command.executionLeaseId, 'executionLeaseId');
    this.assertLeaseDuration(command.leaseDurationMs);
    const now = new Date();
    const executionLeaseExpiresAt = new Date(
      now.getTime() + command.leaseDurationMs,
    );

    return this.prisma.$transaction(async (tx) => {
      const renewed = await tx.aiRun.updateMany({
        where: {
          id: command.runId,
          executionLeaseId: command.executionLeaseId,
          executionLeaseExpiresAt: { gt: now },
          status: {
            in: [AiRunStatus.RUNNING, AiRunStatus.CANCELLATION_REQUESTED],
          },
        },
        data: { executionLeaseExpiresAt },
      });
      if (renewed.count !== 1) {
        await this.assertRunExists(tx, command.runId);
        this.throwExecutionLeaseInvalid('AI 执行租约不存在、已过期或已被替换');
      }

      return {
        run: toAiRun(await this.loadRun(tx, command.runId)),
        executionLeaseId: command.executionLeaseId,
      };
    });
  }

  /** 读取事务内 Run；调用前已经通过条件更新取得行锁。 */
  private async loadRun(tx: Prisma.TransactionClient, runId: string) {
    const run = await tx.aiRun.findUnique({ where: { id: runId } });
    if (!run) {
      this.throwRunNotFound();
    }
    return run;
  }

  /** 区分不存在的 Run 和存在但已经被领取或租约失效的 Run。 */
  private async assertRunExists(
    tx: Prisma.TransactionClient,
    runId: string,
  ): Promise<void> {
    const exists = await tx.aiRun.findUnique({
      where: { id: runId },
      select: { id: true },
    });
    if (!exists) {
      this.throwRunNotFound();
    }
  }

  /** 校验租约时长处于第一版允许范围。 */
  private assertLeaseDuration(leaseDurationMs: number): void {
    if (
      !Number.isInteger(leaseDurationMs) ||
      leaseDurationMs < MIN_EXECUTION_LEASE_MILLISECONDS ||
      leaseDurationMs > MAX_EXECUTION_LEASE_MILLISECONDS
    ) {
      this.throwValidationError(
        'leaseDurationMs',
        `执行租约时长必须介于 ${MIN_EXECUTION_LEASE_MILLISECONDS} 到 ${MAX_EXECUTION_LEASE_MILLISECONDS} 毫秒`,
      );
    }
  }

  /** 防御性校验内部命令中的 UUID 字段。 */
  private assertUuid(value: string, field: string): void {
    if (!UUID_PATTERN.test(value)) {
      this.throwValidationError(field, `${field} 必须是有效 UUID`);
    }
  }

  /** 抛出稳定的字段级租约命令校验错误。 */
  private throwValidationError(field: string, message: string): never {
    throw new BusinessException({
      code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
      message,
      status: HttpStatus.BAD_REQUEST,
      details: [{ field, message, rule: 'AI_RUN_LEASE_VALIDATION' }],
    });
  }

  /** 抛出 Run 不存在的稳定错误。 */
  private throwRunNotFound(): never {
    throw new BusinessException({
      code: API_ERROR_CODES.AI_RUN_NOT_FOUND,
      message: 'AI 运行不存在',
      status: HttpStatus.NOT_FOUND,
    });
  }

  /** 抛出领取竞争失败或租约失效的 fencing 错误。 */
  private throwExecutionLeaseInvalid(message: string): never {
    throw new BusinessException({
      code: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
      message,
      status: HttpStatus.CONFLICT,
    });
  }
}
