/**
 * 本文件负责第二阶段 Thread、用户消息和初始 Run 的原子创建与幂等重放。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client-runtime-utils';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  AiMessageDispatchState,
  AiMessageRole,
  AiMessageSubmissionMode,
  AiRunStatus,
} from '../../../generated/prisma';
import type {
  AiThreadMessageSubmissionResult,
  AiThreadRunCreationResult,
  CreateAiThreadMessageRunInput,
  CreateAiThreadRunInput,
} from '../types/ai-persistence.types';
import {
  assertAiRequiredText,
  createAiRequestFingerprint,
  createAiThreadTitle,
  toPrismaAiLanguageModelRole,
} from './ai-persistence.utils';
import { AiQueueService } from './ai-queue.service';
import { AiRunControlService } from './ai-run-control.service';

@Injectable()
export class AiThreadService {
  /** 注入数据库和队列事务服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: AiQueueService,
    private readonly runControlService: AiRunControlService,
  ) {}

  /** 原子创建 Thread、首条用户消息和首个排队 Run，并处理创建请求的幂等重放。 */
  async createThreadWithInitialRun(
    input: CreateAiThreadRunInput,
  ): Promise<AiThreadRunCreationResult> {
    this.assertThreadCreationInput(input);
    const requestFingerprint = createAiRequestFingerprint(input.message);
    const existing = await this.findThreadCreationReplay(
      input.ownerUserId,
      input.idempotencyKey,
    );
    if (existing) {
      return this.resolveThreadCreationReplay(existing, requestFingerprint);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const concurrent = await tx.aiThread.findFirst({
          where: {
            ownerUserId: input.ownerUserId,
            createIdempotencyKey: input.idempotencyKey,
          },
          include: {
            messages: {
              where: {
                authorUserId: input.ownerUserId,
                clientRequestId: input.idempotencyKey,
              },
              include: { runsAsInput: { take: 1 } },
              take: 1,
            },
          },
        });
        if (concurrent) {
          return this.resolveThreadCreationReplay(
            concurrent,
            requestFingerprint,
          );
        }

        const thread = await tx.aiThread.create({
          data: {
            ownerUserId: input.ownerUserId,
            createIdempotencyKey: input.idempotencyKey,
            createRequestFingerprint: requestFingerprint,
            title: createAiThreadTitle(input.message),
            nextQueueSequence: 2,
          },
        });
        const message = await tx.aiMessage.create({
          data: {
            threadId: thread.id,
            authorUserId: input.ownerUserId,
            clientRequestId: input.idempotencyKey,
            requestFingerprint,
            role: AiMessageRole.USER,
            content: input.message,
            dispatchState: AiMessageDispatchState.DISPATCHED,
            queueSequence: 1,
            submissionMode: AiMessageSubmissionMode.NORMAL,
            requestedModelRole: toPrismaAiLanguageModelRole(input.modelRole),
          },
        });
        const run = await tx.aiRun.create({
          data: {
            threadId: thread.id,
            userMessageId: message.id,
            status: AiRunStatus.QUEUED,
            modelRole: toPrismaAiLanguageModelRole(input.modelRole),
          },
        });
        await tx.aiThread.update({
          where: { id: thread.id },
          data: { activeRunId: run.id },
        });

        return {
          threadId: thread.id,
          messageId: message.id,
          runId: run.id,
          replayed: false,
        };
      });
    } catch (error) {
      if (!this.isUniqueConstraintViolation(error)) {
        throw error;
      }

      const concurrent = await this.findThreadCreationReplay(
        input.ownerUserId,
        input.idempotencyKey,
      );
      if (!concurrent) {
        throw error;
      }
      return this.resolveThreadCreationReplay(concurrent, requestFingerprint);
    }
  }

  /**
   * 原子持久化既有 Thread 的用户输入；空闲 Thread 只领取队首，活跃 Run 期间仅入队。
   * 调整方向会替代全部尚未领取的旧用户输入，并在同一事务中请求取消当前 Run。
   */
  async createMessageWithRun(
    input: CreateAiThreadMessageRunInput,
  ): Promise<AiThreadMessageSubmissionResult> {
    this.assertThreadMessageInput(input);
    const submissionMode = input.submissionMode ?? 'NORMAL';
    const requestFingerprint = createAiRequestFingerprint(
      JSON.stringify({ message: input.message, submissionMode }),
    );
    const existing = await this.findThreadMessageReplay(input);
    if (existing) {
      return this.resolveThreadMessageReplay(existing, requestFingerprint);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const concurrent = await tx.aiMessage.findFirst({
          where: {
            threadId: input.threadId,
            authorUserId: input.ownerUserId,
            clientRequestId: input.idempotencyKey,
          },
          include: { runsAsInput: { take: 1 } },
        });
        if (concurrent) {
          return this.resolveThreadMessageReplay(
            concurrent,
            requestFingerprint,
          );
        }

        const thread = await this.queueService.lockThread(
          tx,
          input.threadId,
          input.ownerUserId,
        );
        if (!thread) {
          throw this.createThreadNotFoundException();
        }
        const lockedReplay = await tx.aiMessage.findFirst({
          where: {
            threadId: input.threadId,
            authorUserId: input.ownerUserId,
            clientRequestId: input.idempotencyKey,
          },
          include: { runsAsInput: { take: 1 } },
        });
        if (lockedReplay) {
          return this.resolveThreadMessageReplay(
            lockedReplay,
            requestFingerprint,
          );
        }
        if (submissionMode === 'STEER') {
          await this.queueService.supersedeQueuedMessages(tx, thread.id);
        }

        const queueSequence = await this.queueService.allocateQueueSequence(
          tx,
          thread.id,
        );
        const message = await tx.aiMessage.create({
          data: {
            threadId: thread.id,
            authorUserId: input.ownerUserId,
            clientRequestId: input.idempotencyKey,
            requestFingerprint,
            role: AiMessageRole.USER,
            content: input.message,
            dispatchState: AiMessageDispatchState.QUEUED,
            queueSequence,
            submissionMode: this.toPrismaSubmissionMode(submissionMode),
            requestedModelRole: toPrismaAiLanguageModelRole(input.modelRole),
          },
        });

        const stopResult =
          submissionMode === 'STEER'
            ? await this.runControlService.requestActiveRunCancellationInTransaction(
                tx,
                {
                  threadId: thread.id,
                  activeRunId: thread.activeRunId,
                  cancellationReason: 'USER_REDIRECTED',
                },
              )
            : null;
        const claimed = stopResult?.nextRunId
          ? { messageId: message.id, runId: stopResult.nextRunId }
          : thread.activeRunId || stopResult
            ? null
            : await this.queueService.claimNextQueuedMessage(tx, thread.id);

        return {
          threadId: thread.id,
          messageId: message.id,
          runId: claimed?.messageId === message.id ? claimed.runId : null,
          dispatchState:
            claimed?.messageId === message.id ? 'DISPATCHED' : 'QUEUED',
          queueSequence,
          submissionMode,
          replayed: false,
        };
      });
    } catch (error) {
      if (!this.isUniqueConstraintViolation(error)) {
        throw error;
      }

      const concurrent = await this.findThreadMessageReplay(input);
      if (concurrent) {
        return this.resolveThreadMessageReplay(concurrent, requestFingerprint);
      }

      throw error;
    }
  }

  /** 校验创建 Thread 事务需要的服务端输入。 */
  private assertThreadCreationInput(input: CreateAiThreadRunInput): void {
    assertAiRequiredText(input.message, '首条消息');
    assertAiRequiredText(input.idempotencyKey, '幂等键');
  }

  /** 校验创建后续消息事务需要的服务端输入。 */
  private assertThreadMessageInput(input: CreateAiThreadMessageRunInput): void {
    assertAiRequiredText(input.threadId, 'Thread 标识');
    assertAiRequiredText(input.message, '消息');
    assertAiRequiredText(input.idempotencyKey, '幂等键');
  }

  /** 查询同一用户创建 Thread 时已经提交过的同一幂等键。 */
  private findThreadCreationReplay(
    ownerUserId: number,
    idempotencyKey: string,
  ) {
    return this.prisma.aiThread.findFirst({
      where: { ownerUserId, createIdempotencyKey: idempotencyKey },
      include: {
        messages: {
          where: { authorUserId: ownerUserId, clientRequestId: idempotencyKey },
          include: { runsAsInput: { take: 1 } },
          take: 1,
        },
      },
    });
  }

  /** 校验创建 Thread 幂等重放的正文一致性，并还原第一次创建的资源标识。 */
  private resolveThreadCreationReplay(
    thread: Awaited<ReturnType<AiThreadService['findThreadCreationReplay']>>,
    requestFingerprint: string,
  ): AiThreadRunCreationResult {
    if (!thread) {
      throw new Error('AI Thread 幂等重放缺少既有记录。');
    }
    if (thread.createRequestFingerprint !== requestFingerprint) {
      throw this.createIdempotencyConflictException();
    }
    const message = thread.messages[0];
    const run = message?.runsAsInput[0];
    if (!message || !run) {
      throw new Error('AI Thread 幂等记录缺少首条消息或首个 Run。');
    }

    return {
      threadId: thread.id,
      messageId: message.id,
      runId: run.id,
      replayed: true,
    };
  }

  /** 查询同一 Thread、用户和幂等键下已经创建过的用户消息。 */
  private findThreadMessageReplay(input: CreateAiThreadMessageRunInput) {
    return this.prisma.aiMessage.findFirst({
      where: {
        threadId: input.threadId,
        authorUserId: input.ownerUserId,
        clientRequestId: input.idempotencyKey,
      },
      include: { runsAsInput: { take: 1 } },
    });
  }

  /** 校验后续消息重放的请求语义，并还原已持久化的投递状态。 */
  private resolveThreadMessageReplay(
    message: Awaited<ReturnType<AiThreadService['findThreadMessageReplay']>>,
    requestFingerprint: string,
  ): AiThreadMessageSubmissionResult {
    if (!message) {
      throw new Error('AI 消息幂等重放缺少既有记录。');
    }
    if (message.requestFingerprint !== requestFingerprint) {
      throw this.createIdempotencyConflictException();
    }
    if (
      !message.dispatchState ||
      message.queueSequence === null ||
      !message.submissionMode
    ) {
      throw new Error('AI 消息幂等记录缺少投递状态。');
    }
    const run = message.runsAsInput[0];

    return {
      threadId: message.threadId,
      messageId: message.id,
      runId: run?.id ?? null,
      dispatchState: message.dispatchState,
      queueSequence: message.queueSequence,
      submissionMode: this.toContractSubmissionMode(message.submissionMode),
      replayed: true,
    };
  }

  /** 将 contracts 的提交模式转换为 Prisma 持久化枚举。 */
  private toPrismaSubmissionMode(
    submissionMode: 'NORMAL' | 'STEER',
  ): AiMessageSubmissionMode {
    return submissionMode === 'STEER'
      ? AiMessageSubmissionMode.STEER
      : AiMessageSubmissionMode.NORMAL;
  }

  /** 将 Prisma 持久化枚举转换为 contracts 的稳定提交模式。 */
  private toContractSubmissionMode(
    submissionMode: AiMessageSubmissionMode,
  ): 'NORMAL' | 'STEER' {
    return submissionMode === AiMessageSubmissionMode.STEER
      ? 'STEER'
      : 'NORMAL';
  }

  /** 判断异常是否由数据库唯一约束触发，供并发幂等重放使用。 */
  private isUniqueConstraintViolation(
    error: unknown,
  ): error is PrismaClientKnownRequestError {
    return (
      error instanceof PrismaClientKnownRequestError && error.code === 'P2002'
    );
  }

  /** 创建不泄露其他用户 Thread 存在性的未找到异常。 */
  private createThreadNotFoundException(): BusinessException {
    return new BusinessException({
      code: API_ERROR_CODES.AI_THREAD_NOT_FOUND,
      message: 'AI 会话不存在或无权访问',
      status: HttpStatus.NOT_FOUND,
    });
  }

  /** 创建同一幂等键被不同请求正文复用时的稳定冲突异常。 */
  private createIdempotencyConflictException(): BusinessException {
    return new BusinessException({
      code: API_ERROR_CODES.AI_IDEMPOTENCY_CONFLICT,
      message: '同一幂等键不能用于不同的请求内容',
      status: HttpStatus.CONFLICT,
    });
  }
}
