/**
 * 本文件是内部 Agent Runtime 一次 Run 从领取到终态的执行入口。
 * Runtime 位于 Next.js 服务端，只持有 runId 与执行租约；所有业务身份、上下文、
 * 工具目录、工具鉴权和状态写入都由本服务从 PostgreSQL 现取现算，
 * 绝不接受调用方传入的用户标识或业务范围。
 *
 * 本服务只做编排，具体职责仍分散在各专职服务中：领取与租约、上下文预算、
 * 助手消息、事件、步骤、工具编排与终态收敛。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import { AiRunStatus } from '../../../generated/prisma';
import type { Prisma } from '../../../generated/prisma';
import type {
  AiRunStopResult,
  CompleteAiRunInput,
  RecordAiStepInput,
} from '../types/ai-persistence.types';
import {
  AI_RUNTIME_SERVICE_IDENTITY,
  type ClaimedAiRuntimeExecution,
} from '../types/ai-runtime.types';
import type {
  AiToolDescriptor,
  AiToolExecutionContext,
} from '../types/ai-tool-registry.types';
import { AiAssistantMessageService } from './ai-assistant-message.service';
import { AiContextBudgetService, type AiContextMessage } from './ai-context-budget.service';
import { AiEventService } from './ai-event.service';
import { AiRunControlService } from './ai-run-control.service';
import { AiRunService } from './ai-run.service';
import { AiRuntimeExecutionService } from './ai-runtime-execution.service';
import { AiStepService, type RecordedAiStep } from './ai-step.service';
import {
  AiToolInvocationService,
  type AiToolInvocationRequest,
  type AiToolInvocationResult,
} from './ai-tool-invocation.service';
import { AiToolRegistryService } from './ai-tool-registry.service';

/** Runtime 成功领取一个 Run 后可用于执行模型循环的完整会话数据。 */
export type AiRuntimeSession = {
  /** 从持久化 Run 重新读取的受控执行上下文。 */
  execution: ClaimedAiRuntimeExecution;
  /** 受基础预算限制的最近历史消息，按时间正序。 */
  recentMessages: AiContextMessage[];
  /** 当前允许模型使用的全部只读工具描述。 */
  tools: readonly AiToolDescriptor[];
};

@Injectable()
export class AiRuntimeSessionService {
  /** 注入领取、上下文、消息、事件、步骤、工具与终态收敛服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionService: AiRuntimeExecutionService,
    private readonly contextBudgetService: AiContextBudgetService,
    private readonly toolRegistry: AiToolRegistryService,
    private readonly toolInvocationService: AiToolInvocationService,
    private readonly assistantMessageService: AiAssistantMessageService,
    private readonly eventService: AiEventService,
    private readonly stepService: AiStepService,
    private readonly runService: AiRunService,
    private readonly runControlService: AiRunControlService,
  ) {}

  /**
   * 原子领取一个排队 Run，并组装模型循环所需的受限上下文与工具目录。
   * 返回 null 表示 Run 已被其他执行器领取或已失效，调用方不得启动模型循环。
   */
  async startSession(runId: string): Promise<AiRuntimeSession | null> {
    const execution = await this.executionService.claimExecution({
      serviceIdentity: AI_RUNTIME_SERVICE_IDENTITY,
      runId,
    });
    if (!execution) {
      return null;
    }

    const recentMessages = await this.contextBudgetService.buildRecentMessages({
      threadId: execution.threadId,
      currentUserMessageId: execution.userMessageId,
    });

    return {
      execution,
      recentMessages,
      tools: this.toolRegistry.listDescriptors(),
    };
  }

  /** 延长当前执行器租约；租约已被取消或过期时抛出稳定冲突，Runtime 必须立即停止。 */
  async renewLease(runId: string, executionLeaseId: string): Promise<Date> {
    return this.runService.renewExecutionLease({ runId, executionLeaseId });
  }

  /** 确保当前 Run 已有助手消息占位，供文本增量事件引用稳定的 messageId。 */
  async ensureAssistantMessage(
    runId: string,
    executionLeaseId: string,
  ): Promise<{ messageId: string }> {
    return this.assistantMessageService.ensureAssistantMessage({
      runId,
      executionLeaseId,
    });
  }

  /** 追加一条助手文本增量事件；先落库再由订阅方按序号补拉。 */
  async appendAssistantTextDelta(input: {
    runId: string;
    executionLeaseId: string;
    messageId: string;
    delta: string;
  }): Promise<{ sequence: number }> {
    const event = await this.eventService.appendAssistantTextDelta(input);

    return { sequence: event.sequence };
  }

  /** 记录一次模型步骤的受控元数据与 Token 摘要。 */
  async recordStep(input: RecordAiStepInput): Promise<RecordedAiStep> {
    return this.stepService.recordStep(input);
  }

  /**
   * 执行一次模型请求的工具调用。
   * 工具执行上下文从持久化 Run 现取现算，用户身份与租约都不接受调用方传入，
   * 因此 Runtime 无法越过 NestJS 的实时鉴权直接读取业务数据。
   */
  async invokeTool(
    runId: string,
    executionLeaseId: string,
    request: AiToolInvocationRequest,
  ): Promise<AiToolInvocationResult> {
    const executionContext = await this.loadToolExecutionContext(
      runId,
      executionLeaseId,
    );

    return this.toolInvocationService.invokeTool(executionContext, request);
  }

  /** 将 Run 收敛为完成或失败终态，并在同一事务写入助手最终正文与用量。 */
  async completeRun(
    input: Omit<CompleteAiRunInput, 'ownerUserId'> & {
      usage?: Prisma.InputJsonValue | null;
      resolvedModelId?: string | null;
    },
  ): Promise<AiRunStopResult> {
    const ownerUserId = await this.findRunOwnerUserId(input.runId);
    const usage = input.usage ?? undefined;
    const resolvedModelId = input.resolvedModelId ?? undefined;
    if (usage !== undefined || resolvedModelId !== undefined) {
      await this.saveRunTelemetry(input.runId, input.executionLeaseId, {
        usage,
        resolvedModelId,
      });
    }

    return this.runControlService.completeRun({
      ownerUserId,
      runId: input.runId,
      executionLeaseId: input.executionLeaseId,
      status: input.status,
      failureReason: input.failureReason,
      failureCode: input.failureCode,
      assistantMessageContent: input.assistantMessageContent,
    });
  }

  /** 执行器已停止写入后确认取消，把取消请求唯一收敛为 CANCELLED。 */
  async confirmCancellation(runId: string): Promise<AiRunStopResult> {
    const ownerUserId = await this.findRunOwnerUserId(runId);

    return this.runControlService.confirmCancellation(ownerUserId, runId);
  }

  /**
   * 在终态写入前保存本次运行的模型用量与实际模型标识。
   * 仍然要求持有有效租约，避免失效执行器回写用量污染审计数据。
   */
  private async saveRunTelemetry(
    runId: string,
    executionLeaseId: string,
    telemetry: {
      usage?: Prisma.InputJsonValue;
      resolvedModelId?: string;
    },
  ): Promise<void> {
    const updated = await this.prisma.aiRun.updateMany({
      where: {
        id: runId,
        status: AiRunStatus.RUNNING,
        executionLeaseId,
        executionLeaseExpiresAt: { gt: new Date() },
      },
      data: {
        ...(telemetry.usage === undefined ? {} : { usage: telemetry.usage }),
        ...(telemetry.resolvedModelId === undefined
          ? {}
          : { resolvedModelId: telemetry.resolvedModelId }),
      },
    });
    if (updated.count !== 1) {
      throw new BusinessException({
        code: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
        message: 'AI 执行租约已失效，请停止当前执行器',
        status: HttpStatus.CONFLICT,
      });
    }
  }

  /**
   * 从持久化 Run 现取现算工具执行上下文。
   * 只有仍处于 RUNNING、租约未过期且租约标识一致的执行器才能取得上下文。
   */
  private async loadToolExecutionContext(
    runId: string,
    executionLeaseId: string,
  ): Promise<AiToolExecutionContext> {
    const run = await this.prisma.aiRun.findFirst({
      where: {
        id: runId,
        status: AiRunStatus.RUNNING,
        executionLeaseId,
        executionLeaseExpiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        threadId: true,
        executionLeaseExpiresAt: true,
        thread: { select: { ownerUserId: true } },
      },
    });
    if (!run?.executionLeaseExpiresAt) {
      throw new BusinessException({
        code: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
        message: 'AI 执行租约已失效，请停止当前执行器',
        status: HttpStatus.CONFLICT,
      });
    }

    return {
      runId: run.id,
      threadId: run.threadId,
      ownerUserId: run.thread.ownerUserId,
      executionLeaseId,
      executionLeaseExpiresAt: run.executionLeaseExpiresAt,
    };
  }

  /** 从持久化 Run 读取 Thread 所有者，作为后续状态事务的唯一身份来源。 */
  private async findRunOwnerUserId(runId: string): Promise<number> {
    const run = await this.prisma.aiRun.findUnique({
      where: { id: runId },
      select: { thread: { select: { ownerUserId: true } } },
    });
    if (!run) {
      throw new BusinessException({
        code: API_ERROR_CODES.AI_RUN_NOT_FOUND,
        message: 'AI 运行不存在',
        status: HttpStatus.NOT_FOUND,
      });
    }

    return run.thread.ownerUserId;
  }
}
