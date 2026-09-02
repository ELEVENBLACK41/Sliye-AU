/**
 * 本文件负责 AI 执行租约的原子领取、续租和事务内 fencing 校验。
 * 租约只协调当前执行器，不承担 Thread、Run 或业务事实的权威状态。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../../common/exceptions/business.exception';
import { PrismaService } from '../../../../database/prisma.service';
import { AiRunStatus, Prisma } from '../../../../generated/prisma';
import { assertAiRequiredText } from '../../utils/ai-persistence.utils';

/** 第一版执行器租约时长；续租以同一时长滚动延长有效期。 */
export const AI_RUN_EXECUTION_LEASE_DURATION_MS = 30_000;

/** 成功领取排队 Run 后交给执行器保存的租约凭据。 */
export type ClaimedAiRunExecutionLease = {
  /** 被当前执行器唯一领取的 Run 标识。 */
  runId: string;
  /** 后续续租和 fenced 写入必须携带的随机租约标识。 */
  executionLeaseId: string;
  /** 当前租约的绝对过期时间。 */
  executionLeaseExpiresAt: Date;
};

/** 需要证明当前执行器仍持有 Run 租约的内部输入。 */
export type AiExecutionLeaseInput = {
  /** 当前执行的 Run 标识。 */
  runId: string;
  /** 领取时签发、不可由其他执行器猜测的租约标识。 */
  executionLeaseId: string;
};

@Injectable()
export class AiExecutionLeaseService {
  /** 注入唯一 Prisma 服务，所有租约判断均以 PostgreSQL 当前状态为准。 */
  constructor(private readonly prisma: PrismaService) {}

  /** 原子领取一个仍处于 QUEUED 的 Run，并为唯一成功的执行器签发短期租约。 */
  async claimQueuedRun(
    runId: string,
  ): Promise<ClaimedAiRunExecutionLease | null> {
    assertAiRequiredText(runId, 'Run 标识');
    const claimedAt = new Date();
    const executionLeaseId = randomUUID();
    const executionLeaseExpiresAt = new Date(
      claimedAt.getTime() + AI_RUN_EXECUTION_LEASE_DURATION_MS,
    );
    const claimed = await this.prisma.aiRun.updateMany({
      where: { id: runId, status: AiRunStatus.QUEUED },
      data: {
        status: AiRunStatus.RUNNING,
        executionLeaseId,
        executionLeaseExpiresAt,
        startedAt: claimedAt,
      },
    });
    if (claimed.count !== 1) {
      return null;
    }

    return { runId, executionLeaseId, executionLeaseExpiresAt };
  }

  /** 仅允许仍处于 RUNNING 且租约未过期的当前执行器延长租约。 */
  async renewExecutionLease(input: AiExecutionLeaseInput): Promise<Date> {
    this.assertLeaseInput(input);
    const now = new Date();
    const executionLeaseExpiresAt = new Date(
      now.getTime() + AI_RUN_EXECUTION_LEASE_DURATION_MS,
    );
    const renewed = await this.prisma.aiRun.updateMany({
      where: {
        id: input.runId,
        status: AiRunStatus.RUNNING,
        executionLeaseId: input.executionLeaseId,
        executionLeaseExpiresAt: { gt: now },
      },
      data: { executionLeaseExpiresAt },
    });
    if (renewed.count !== 1) {
      throw this.createExecutionLeaseInvalidException();
    }

    return executionLeaseExpiresAt;
  }

  /**
   * 在同一事务内锁定并触碰 Run，保证后续事件、消息或工具结果写入不会越过失效租约。
   * 该方法只验证 RUNNING 执行器；系统控制路径应通过各自状态事务写入审计事件。
   */
  async assertActiveExecutionLeaseInTransaction(
    transaction: Prisma.TransactionClient,
    input: AiExecutionLeaseInput,
  ): Promise<void> {
    this.assertLeaseInput(input);
    const now = new Date();
    const fenced = await transaction.aiRun.updateMany({
      where: {
        id: input.runId,
        status: AiRunStatus.RUNNING,
        executionLeaseId: input.executionLeaseId,
        executionLeaseExpiresAt: { gt: now },
      },
      data: { updatedAt: now },
    });
    if (fenced.count !== 1) {
      throw this.createExecutionLeaseInvalidException();
    }
  }

  /** 将给定 Run 的当前执行租约立即失效，拒绝旧执行器之后的任何 fenced 写入。 */
  async invalidateExecutionLeaseInTransaction(
    transaction: Prisma.TransactionClient,
    runId: string,
  ): Promise<void> {
    await transaction.aiRun.update({
      where: { id: runId },
      data: {
        executionLeaseId: null,
        executionLeaseExpiresAt: new Date(),
      },
    });
  }

  /** 校验租约操作缺少标识时及早失败，避免向数据库提交无意义条件更新。 */
  private assertLeaseInput(input: AiExecutionLeaseInput): void {
    assertAiRequiredText(input.runId, 'Run 标识');
    assertAiRequiredText(input.executionLeaseId, '执行租约标识');
  }

  /** 创建不泄露 Run 存在性或当前租约内容的统一 fenced 写入冲突。 */
  private createExecutionLeaseInvalidException(): BusinessException {
    return new BusinessException({
      code: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
      message: 'AI 执行租约已失效，请停止当前执行器',
      status: HttpStatus.CONFLICT,
    });
  }
}
