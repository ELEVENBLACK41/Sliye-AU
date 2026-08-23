/**
 * 本文件负责 AI Run 的用户取消、执行器确认以及成功或失败终态收敛。
 * 所有执行结果写入都把 executionLeaseId 当作 fencing token，拒绝旧执行器的迟到结果。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import {
  AiMessageRole,
  AiRunCancellationReason,
  AiSourceDependencyUsage,
  AiRunStatus,
  type Prisma,
} from '../../../generated/prisma';
import { toAiRun, toAiRunPublicSummary } from '../ai-state.mapper';
import type {
  CompleteAiRunCommand,
  ConfirmAiRunCancellationCommand,
  FailAiRunCommand,
  RequestAiRunCancellationCommand,
} from '../types/ai-state-persistence.types';
import { AiThreadScopeService } from './ai-thread-scope.service';

/** 助手最终消息的第一版持久化字符上限。 */
const MAX_ASSISTANT_MESSAGE_CHARACTERS = 100_000;
/** 接受标准 UUID 文本，数据库仍通过 UUID 原生类型执行最终约束。 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AiRunService {
  /** 注入 Thread 范围服务以在同一事务内执行权限复核和状态收敛。 */
  constructor(private readonly threadScopeService: AiThreadScopeService) {}

  /** 用户请求停止 Run；排队状态直接取消，执行状态先进入正在取消。 */
  async requestCancellation(
    command: RequestAiRunCancellationCommand,
  ): Promise<ReturnType<typeof toAiRunPublicSummary>> {
    this.assertUuid(command.runId, 'runId');
    const now = new Date();

    return this.threadScopeService.withAccessibleRun(
      command.authorization,
      command.runId,
      [],
      async (tx) => {
        const queuedCancellation = await tx.aiRun.updateMany({
          where: {
            id: command.runId,
            status: AiRunStatus.QUEUED,
            thread: { ownerUserId: command.authorization.userId },
          },
          data: {
            status: AiRunStatus.CANCELLED,
            cancellationReason: AiRunCancellationReason.USER_REQUESTED,
            executionLeaseId: null,
            executionLeaseExpiresAt: null,
            finishedAt: now,
            nextEventSequence: { increment: 1 },
          },
        });

        if (queuedCancellation.count === 1) {
          const run = await this.loadRun(tx, command.runId);
          await this.appendStatusEvent(tx, run, AiRunStatus.QUEUED);
          await this.releaseThreadGate(tx, run.threadId, run.id);
          return toAiRunPublicSummary(run);
        }

        const cancellationData = {
          status: AiRunStatus.CANCELLATION_REQUESTED,
          cancellationReason: AiRunCancellationReason.USER_REQUESTED,
          nextEventSequence: { increment: 1 },
        } satisfies Prisma.AiRunUpdateManyMutationInput;
        const runningCancellation = await tx.aiRun.updateMany({
          where: {
            id: command.runId,
            status: AiRunStatus.RUNNING,
            thread: { ownerUserId: command.authorization.userId },
          },
          data: cancellationData,
        });

        if (runningCancellation.count === 1) {
          const run = await this.loadRun(tx, command.runId);
          await this.appendStatusEvent(tx, run, AiRunStatus.RUNNING);
          return toAiRunPublicSummary(run);
        }

        const waitingCancellation = await tx.aiRun.updateMany({
          where: {
            id: command.runId,
            status: AiRunStatus.WAITING_APPROVAL,
            thread: { ownerUserId: command.authorization.userId },
          },
          data: cancellationData,
        });
        if (waitingCancellation.count === 1) {
          const run = await this.loadRun(tx, command.runId);
          await this.appendStatusEvent(tx, run, AiRunStatus.WAITING_APPROVAL);
          return toAiRunPublicSummary(run);
        }

        const current = await this.loadRun(tx, command.runId);
        if (
          current.status === AiRunStatus.CANCELLATION_REQUESTED ||
          current.status === AiRunStatus.CANCELLED
        ) {
          return toAiRunPublicSummary(current);
        }

        this.throwInvalidStatusTransition(current.status, '请求取消');
      },
    );
  }

  /** 当前执行器确认 Abort 已生效，并把正在取消的 Run 收敛为取消终态。 */
  async confirmCancellation(
    command: ConfirmAiRunCancellationCommand,
  ): Promise<ReturnType<typeof toAiRun>> {
    this.assertFencedCommand(command);
    const now = new Date();

    return this.threadScopeService.withAccessibleRun(
      command.authorization,
      command.runId,
      [],
      async (tx) => {
        const cancelled = await tx.aiRun.updateMany({
          where: {
            id: command.runId,
            status: AiRunStatus.CANCELLATION_REQUESTED,
            executionLeaseId: command.executionLeaseId,
            executionLeaseExpiresAt: { gt: now },
          },
          data: {
            status: AiRunStatus.CANCELLED,
            executionLeaseId: null,
            executionLeaseExpiresAt: null,
            finishedAt: now,
            nextEventSequence: { increment: 1 },
          },
        });

        if (cancelled.count !== 1) {
          await this.assertRunExists(tx, command.runId);
          this.throwExecutionLeaseInvalid('取消确认使用的执行租约已经失效');
        }

        const run = await this.loadRun(tx, command.runId);
        await this.appendStatusEvent(
          tx,
          run,
          AiRunStatus.CANCELLATION_REQUESTED,
        );
        await this.releaseThreadGate(tx, run.threadId, run.id);
        return toAiRun(run);
      },
    );
  }

  /** 在同一事务中写入助手最终消息、完成状态、状态事件并释放 Thread 门禁。 */
  async complete(
    command: CompleteAiRunCommand,
  ): Promise<ReturnType<typeof toAiRun>> {
    this.assertFencedCommand(command);
    this.assertUuid(command.assistantMessageId, 'assistantMessageId');
    const assistantContent = this.normalizeAssistantContent(
      command.assistantContent,
    );
    const resolvedModelId = command.resolvedModelId.trim();
    if (!resolvedModelId) {
      this.throwValidationError('resolvedModelId', '实际模型 ID 不能为空');
    }
    const now = new Date();

    return this.threadScopeService.withAccessibleRun(
      command.authorization,
      command.runId,
      command.sourceIds,
      async (tx) => {
        const completed = await tx.aiRun.updateMany({
          where: {
            id: command.runId,
            status: AiRunStatus.RUNNING,
            executionLeaseId: command.executionLeaseId,
            executionLeaseExpiresAt: { gt: now },
          },
          data: {
            status: AiRunStatus.COMPLETED,
            resolvedModelId,
            executionLeaseId: null,
            executionLeaseExpiresAt: null,
            finishedAt: now,
            nextEventSequence: { increment: 1 },
          },
        });

        if (completed.count !== 1) {
          await this.assertRunExists(tx, command.runId);
          this.throwExecutionLeaseInvalid('完成写入使用的执行租约已经失效');
        }

        const run = await this.loadRun(tx, command.runId);
        await tx.aiMessage.create({
          data: {
            id: command.assistantMessageId,
            threadId: run.threadId,
            runId: run.id,
            role: AiMessageRole.ASSISTANT,
            content: assistantContent,
          },
        });
        await this.threadScopeService.registerSourceDependencies(
          tx,
          run.id,
          AiSourceDependencyUsage.ANSWER_CITATION,
          command.sourceIds,
        );
        await this.appendStatusEvent(tx, run, AiRunStatus.RUNNING);
        await this.releaseThreadGate(tx, run.threadId, run.id);
        return toAiRun(run);
      },
    );
  }

  /** 使用当前有效租约把运行中或正在取消的 Run 收敛为失败终态。 */
  async fail(command: FailAiRunCommand): Promise<ReturnType<typeof toAiRun>> {
    this.assertFencedCommand(command);
    const now = new Date();

    return this.threadScopeService.withAccessibleRun(
      command.authorization,
      command.runId,
      [],
      async (tx) => {
        const failureData = {
          status: AiRunStatus.FAILED,
          failureReason: command.failureReason,
          failureCode: command.failureCode,
          executionLeaseId: null,
          executionLeaseExpiresAt: null,
          finishedAt: now,
          nextEventSequence: { increment: 1 },
        } satisfies Prisma.AiRunUpdateManyMutationInput;
        const runningFailure = await tx.aiRun.updateMany({
          where: {
            id: command.runId,
            status: AiRunStatus.RUNNING,
            executionLeaseId: command.executionLeaseId,
            executionLeaseExpiresAt: { gt: now },
          },
          data: failureData,
        });
        let fromStatus: AiRunStatus = AiRunStatus.RUNNING;
        if (runningFailure.count !== 1) {
          const cancellationFailure = await tx.aiRun.updateMany({
            where: {
              id: command.runId,
              status: AiRunStatus.CANCELLATION_REQUESTED,
              executionLeaseId: command.executionLeaseId,
              executionLeaseExpiresAt: { gt: now },
            },
            data: failureData,
          });
          if (cancellationFailure.count !== 1) {
            await this.assertRunExists(tx, command.runId);
            this.throwExecutionLeaseInvalid(
              '失败终态写入使用的执行租约已经失效',
            );
          }
          fromStatus = AiRunStatus.CANCELLATION_REQUESTED;
        }

        const run = await this.loadRun(tx, command.runId);
        await this.appendStatusEvent(tx, run, fromStatus);
        await this.releaseThreadGate(tx, run.threadId, run.id);
        return toAiRun(run);
      },
    );
  }

  /** 读取事务内 Run；调用前已经通过条件更新取得行锁。 */
  private async loadRun(tx: Prisma.TransactionClient, runId: string) {
    const run = await tx.aiRun.findUnique({ where: { id: runId } });
    if (!run) {
      this.throwRunNotFound();
    }
    return run;
  }

  /** 区分不存在的 Run 和存在但租约/状态不匹配的 Run。 */
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

  /** 把已经在 Run 行中预留的下一事件序号固化为状态变化事件。 */
  private async appendStatusEvent(
    tx: Prisma.TransactionClient,
    run: Awaited<ReturnType<AiRunService['loadRun']>>,
    fromStatus: AiRunStatus,
  ): Promise<void> {
    await tx.aiEvent.create({
      data: {
        runId: run.id,
        sequence: run.nextEventSequence - 1,
        type: 'RUN_STATUS_CHANGED',
        payload: {
          fromStatus,
          toStatus: run.status,
          cancellationReason: run.cancellationReason,
          failureReason: run.failureReason,
        },
      },
    });
  }

  /** 仅清理仍指向当前终态 Run 的 Thread 门禁，避免覆盖后续合法 Run。 */
  private async releaseThreadGate(
    tx: Prisma.TransactionClient,
    threadId: string,
    runId: string,
  ): Promise<void> {
    await tx.aiThread.updateMany({
      where: { id: threadId, activeRunId: runId },
      data: { activeRunId: null },
    });
  }

  /** 校验所有执行写入共同依赖的 Run 和租约 UUID。 */
  private assertFencedCommand(command: {
    runId: string;
    executionLeaseId: string;
  }): void {
    this.assertUuid(command.runId, 'runId');
    this.assertUuid(command.executionLeaseId, 'executionLeaseId');
  }

  /** 规范化助手最终消息并拒绝空消息或异常大的单条正文。 */
  private normalizeAssistantContent(content: string): string {
    const normalized = content.trim();
    const characterCount = Array.from(normalized).length;
    if (characterCount === 0) {
      this.throwValidationError('assistantContent', '助手最终消息不能为空');
    }
    if (characterCount > MAX_ASSISTANT_MESSAGE_CHARACTERS) {
      this.throwValidationError(
        'assistantContent',
        `助手最终消息不能超过 ${MAX_ASSISTANT_MESSAGE_CHARACTERS} 个字符`,
      );
    }
    return normalized;
  }

  /** 防御性校验内部命令中的 UUID 字段。 */
  private assertUuid(value: string, field: string): void {
    if (!UUID_PATTERN.test(value)) {
      this.throwValidationError(field, `${field} 必须是有效 UUID`);
    }
  }

  /** 抛出稳定的字段级 AI 命令校验错误。 */
  private throwValidationError(field: string, message: string): never {
    throw new BusinessException({
      code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
      message,
      status: HttpStatus.BAD_REQUEST,
      details: [{ field, message, rule: 'AI_RUN_COMMAND_VALIDATION' }],
    });
  }

  /** 抛出不存在或无权访问 Run 的统一错误，避免权限探测。 */
  private throwRunNotFound(): never {
    throw new BusinessException({
      code: API_ERROR_CODES.AI_RUN_NOT_FOUND,
      message: 'AI 运行不存在或当前账号无权访问',
      status: HttpStatus.NOT_FOUND,
    });
  }

  /** 抛出执行租约、状态或过期时间不再允许当前写入的 fencing 错误。 */
  private throwExecutionLeaseInvalid(message: string): never {
    throw new BusinessException({
      code: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
      message,
      status: HttpStatus.CONFLICT,
    });
  }

  /** 抛出当前状态无法执行用户请求动作的稳定冲突。 */
  private throwInvalidStatusTransition(
    currentStatus: AiRunStatus,
    action: string,
  ): never {
    throw new BusinessException({
      code: API_ERROR_CODES.AI_RUN_INVALID_STATUS_TRANSITION,
      message: `AI Run 当前状态 ${currentStatus} 无法${action}`,
      status: HttpStatus.CONFLICT,
    });
  }
}
