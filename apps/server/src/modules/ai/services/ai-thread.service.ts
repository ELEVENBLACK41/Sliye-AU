/**
 * 本文件负责第二阶段 Thread、用户消息和初始 Run 的原子创建与幂等重放。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client-runtime-utils';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import { AiMessageRole, AiRunStatus, Prisma } from '../../../generated/prisma';
import type {
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

@Injectable()
export class AiThreadService {
  /** 注入唯一的 Prisma 数据访问服务。 */
  constructor(private readonly prisma: PrismaService) {}

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

  /** 原子创建既有 Thread 的用户消息和新 Run，并拒绝第二个非终态 Run。 */
  async createMessageWithRun(
    input: CreateAiThreadMessageRunInput,
  ): Promise<AiThreadRunCreationResult> {
    this.assertThreadMessageInput(input);
    const requestFingerprint = createAiRequestFingerprint(input.message);
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

        const thread = await this.lockThreadForRunCreation(
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
        if (thread.activeRunId) {
          throw this.createThreadRunActiveException();
        }

        const message = await tx.aiMessage.create({
          data: {
            threadId: thread.id,
            authorUserId: input.ownerUserId,
            clientRequestId: input.idempotencyKey,
            requestFingerprint,
            role: AiMessageRole.USER,
            content: input.message,
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

      const concurrent = await this.findThreadMessageReplay(input);
      if (concurrent) {
        return this.resolveThreadMessageReplay(concurrent, requestFingerprint);
      }

      const thread = await this.prisma.aiThread.findFirst({
        where: { id: input.threadId, ownerUserId: input.ownerUserId },
        select: { activeRunId: true },
      });
      if (thread?.activeRunId) {
        throw this.createThreadRunActiveException();
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

  /** 校验后续消息重放的正文一致性，并还原对应 Run 标识。 */
  private resolveThreadMessageReplay(
    message: Awaited<ReturnType<AiThreadService['findThreadMessageReplay']>>,
    requestFingerprint: string,
  ): AiThreadRunCreationResult {
    if (!message) {
      throw new Error('AI 消息幂等重放缺少既有记录。');
    }
    if (message.requestFingerprint !== requestFingerprint) {
      throw this.createIdempotencyConflictException();
    }
    const run = message.runsAsInput[0];
    if (!run) {
      throw new Error('AI 消息幂等记录缺少对应 Run。');
    }

    return {
      threadId: message.threadId,
      messageId: message.id,
      runId: run.id,
      replayed: true,
    };
  }

  /** 锁定 Thread 行后再判断活跃指针，避免两个不同请求同时争抢单 Run 门禁而发生死锁。 */
  private async lockThreadForRunCreation(
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
      message: '同一幂等键不能用于不同的请求内容',
      status: HttpStatus.CONFLICT,
    });
  }
}
