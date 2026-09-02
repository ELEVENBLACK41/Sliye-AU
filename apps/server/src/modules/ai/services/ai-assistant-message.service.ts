/**
 * 本文件负责助手消息的占位创建与最终正文写入。
 * 助手消息在第一段文本增量之前先落库，使流事件可以携带稳定的 messageId，
 * 断线补拉时前端能把增量准确追加到同一条消息上；最终正文和 text part
 * 由 Run 终态事务写入，完整 UIMessage parts 由后续 onEnd 收敛。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import { AiMessageRole, Prisma } from '../../../generated/prisma';
import {
  AiExecutionLeaseService,
  type AiExecutionLeaseInput,
} from './ai-execution-lease.service';
import { createAiTextMessageParts } from './ai-persistence.utils';

/** 一条已存在或新建的助手消息标识。 */
export type EnsuredAiAssistantMessage = {
  /** 助手消息标识，供文本增量事件与最终正文写入复用。 */
  messageId: string;
};

@Injectable()
export class AiAssistantMessageService {
  /** 注入数据库与执行租约服务，保证助手消息同样只由当前执行器写入。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionLeaseService: AiExecutionLeaseService,
  ) {}

  /** 在校验执行租约后确保当前 Run 已有助手消息占位；重复调用返回同一条消息。 */
  async ensureAssistantMessage(
    input: AiExecutionLeaseInput,
  ): Promise<EnsuredAiAssistantMessage> {
    return this.prisma.$transaction(async (transaction) => {
      await this.executionLeaseService.assertActiveExecutionLeaseInTransaction(
        transaction,
        input,
      );
      const existing = await transaction.aiMessage.findUnique({
        where: { runId: input.runId },
        select: { id: true },
      });
      if (existing) {
        return { messageId: existing.id };
      }

      const run = await transaction.aiRun.findUnique({
        where: { id: input.runId },
        select: { threadId: true },
      });
      if (!run) {
        throw new BusinessException({
          code: API_ERROR_CODES.AI_RUN_NOT_FOUND,
          message: 'AI 运行不存在',
          status: HttpStatus.NOT_FOUND,
        });
      }

      const created = await transaction.aiMessage.create({
        data: {
          threadId: run.threadId,
          runId: input.runId,
          role: AiMessageRole.ASSISTANT,
          content: '',
          parts: createAiTextMessageParts(''),
        },
        select: { id: true },
      });

      return { messageId: created.id };
    });
  }

  /**
   * 在 Run 终态事务内写入助手最终正文。
   * 由调用方保证已经完成租约校验，因此这里只负责消息本身的创建或更新。
   */
  async writeFinalContentInTransaction(
    transaction: Prisma.TransactionClient,
    input: {
      runId: string;
      threadId: string;
      content: string;
      parts?: Prisma.InputJsonValue;
      metadata?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    const parts = input.parts ?? createAiTextMessageParts(input.content);

    await transaction.aiMessage.upsert({
      where: { runId: input.runId },
      create: {
        threadId: input.threadId,
        runId: input.runId,
        role: AiMessageRole.ASSISTANT,
        content: input.content,
        parts,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      },
      update: {
        content: input.content,
        parts,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      },
    });
  }
}
