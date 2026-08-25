/**
 * 本文件提供 Agent Runtime 领取 AI Run 的内部执行入口。
 * 当前只建立服务身份、领取与受控上下文边界，不执行模型、工具、HTTP 或流式推送。
 */

import { Injectable } from '@nestjs/common';
import type { AiLanguageModelRole } from '@workspace/contracts/ai';
import { PrismaService } from '../../../database/prisma.service';
import {
  AiLanguageModelRole as PrismaAiLanguageModelRole,
  AiRunStatus,
} from '../../../generated/prisma';
import {
  AI_RUNTIME_SERVICE_IDENTITY,
  type AiRuntimeServiceIdentity,
  type ClaimedAiRuntimeExecution,
  type ClaimAiRuntimeExecutionInput,
} from '../types/ai-runtime.types';
import { assertAiRequiredText } from './ai-persistence.utils';
import { AiRunService } from './ai-run.service';

@Injectable()
export class AiRuntimeExecutionService {
  /** 注入 Run 领取服务和数据库，只在领取成功后读取 Runtime 所需的最小持久化上下文。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly runService: AiRunService,
  ) {}

  /**
   * 供已完成内部服务鉴权的 Agent Runtime 原子领取一个排队 Run。
   * 返回 null 表示 Run 已被其他执行器领取或在领取后失效；调用方不得启动模型循环。
   */
  async claimExecution(
    input: ClaimAiRuntimeExecutionInput,
  ): Promise<ClaimedAiRuntimeExecution | null> {
    this.assertRuntimeServiceIdentity(input.serviceIdentity);
    assertAiRequiredText(input.runId, 'Run 标识');

    const lease = await this.runService.claimQueuedRun(input.runId);
    if (!lease) {
      return null;
    }

    const execution = await this.prisma.aiRun.findFirst({
      where: {
        id: lease.runId,
        status: AiRunStatus.RUNNING,
        executionLeaseId: lease.executionLeaseId,
        executionLeaseExpiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        threadId: true,
        userMessageId: true,
        modelRole: true,
        executionLeaseId: true,
        executionLeaseExpiresAt: true,
        thread: { select: { ownerUserId: true } },
        userMessage: { select: { content: true } },
      },
    });
    if (!execution?.executionLeaseId || !execution.executionLeaseExpiresAt) {
      return null;
    }

    return {
      runId: execution.id,
      threadId: execution.threadId,
      ownerUserId: execution.thread.ownerUserId,
      userMessageId: execution.userMessageId,
      userMessageContent: execution.userMessage.content,
      modelRole: this.toContractModelRole(execution.modelRole),
      executionLeaseId: execution.executionLeaseId,
      executionLeaseExpiresAt: execution.executionLeaseExpiresAt,
    };
  }

  /** 拒绝尚未被内部鉴权层归一化的调用身份；该值不是可由浏览器信任的凭据。 */
  private assertRuntimeServiceIdentity(
    serviceIdentity: AiRuntimeServiceIdentity,
  ): void {
    if (serviceIdentity === AI_RUNTIME_SERVICE_IDENTITY) {
      return;
    }

    throw new Error('未经验证的服务身份不能领取 AI Run。');
  }

  /** 将数据库使用的大写模型角色转换为 Runtime 使用的共享契约角色。 */
  private toContractModelRole(
    modelRole: PrismaAiLanguageModelRole,
  ): AiLanguageModelRole {
    return modelRole === PrismaAiLanguageModelRole.DEEP_REVIEW
      ? 'deepReview'
      : 'standard';
  }
}
