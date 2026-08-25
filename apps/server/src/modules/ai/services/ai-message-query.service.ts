/**
 * 本文件负责会话内消息历史的只读游标分页。
 *
 * 数据范围由所属 Thread 的所有者条件保证：先确认会话属于当前用户，
 * 再按会话查询消息，越权统一表现为“会话不存在”。
 *
 * 聊天记录从最新一条向更早方向加载，但返回时转为时间正序，
 * 让客户端可以直接渲染，不需要各自实现反转。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  AiMessageHistoryItem,
  AiMessagePage,
  AiMessageRun,
  AiMessageToolCall,
} from '@workspace/contracts/ai';
import {
  AI_MESSAGE_PAGE_DEFAULT_LIMIT,
  AI_MESSAGE_PAGE_MAX_LIMIT,
} from '@workspace/contracts/ai';
import type { ApiErrorCode } from '@workspace/contracts/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma';
import { AI_CURSOR_KINDS, decodeAiCursor, encodeAiCursor } from './ai-cursor';

/**
 * 消息及其所属 Run、工具调用的字段投影。
 * 用 Prisma.validator 而不是 as const：嵌套 as const 会产生深层 readonly 类型，
 * Prisma 的 select 不接受；validator 既能校验字段合法性又保留字面量推导。
 */
const AI_MESSAGE_HISTORY_SELECT = Prisma.validator<Prisma.AiMessageSelect>()({
  id: true,
  threadId: true,
  runId: true,
  authorUserId: true,
  role: true,
  dispatchState: true,
  queueSequence: true,
  submissionMode: true,
  content: true,
  createdAt: true,
  run: {
    select: {
      id: true,
      status: true,
      failureReason: true,
      failureCode: true,
      cancellationReason: true,
      toolCalls: {
        // 工具输入与输出摘要承载真实业务事实，历史接口一律不返回。
        select: {
          id: true,
          toolName: true,
          status: true,
          durationMs: true,
          failureCode: true,
          failureReason: true,
          startedAt: true,
        },
        orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      },
    },
  },
});

/** 查询结果中的一行消息，含可选的 Run 与工具调用。 */
type AiMessageHistoryRow = Prisma.AiMessageGetPayload<{
  select: typeof AI_MESSAGE_HISTORY_SELECT;
}>;

@Injectable()
export class AiMessageQueryService {
  /** 注入唯一 Prisma 服务；查询始终先校验会话归属。 */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 按创建时间从新到旧分页读取会话消息，返回时转为正序。
   * 包含被替代的历史用户输入：它们确实是用户提交过的内容，
   * 投递状态由 `dispatchState` 表达，由客户端决定如何呈现。
   */
  async listMessages(
    ownerUserId: number,
    threadId: string,
    query: { cursor?: string; limit?: number },
  ): Promise<AiMessagePage> {
    await this.assertThreadOwnership(ownerUserId, threadId);

    const limit = this.normalizeLimit(query.limit);
    // 多取一条用于判断是否还有更早的消息，返回前再截断到请求的条数。
    const rows = await this.prisma.aiMessage.findMany({
      where: { threadId, ...this.toCursorCondition(query.cursor, threadId) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: AI_MESSAGE_HISTORY_SELECT,
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    // 查询按倒序取最新一页，渲染顺序是正序，因此这里统一反转。
    const oldestRow = pageRows.at(-1);

    return {
      items: [...pageRows].reverse().map((row) => this.toHistoryItem(row)),
      nextCursor:
        hasMore && oldestRow
          ? encodeAiCursor({
              kind: AI_CURSOR_KINDS.MESSAGE_LIST,
              scope: threadId,
              time: oldestRow.createdAt,
              id: oldestRow.id,
            })
          : null,
      hasMore,
    };
  }

  /** 确认会话存在且属于当前用户；否则统一返回不存在。 */
  private async assertThreadOwnership(
    ownerUserId: number,
    threadId: string,
  ): Promise<void> {
    const thread = await this.prisma.aiThread.findFirst({
      where: { id: threadId, ownerUserId },
      select: { id: true },
    });
    if (!thread) {
      throw new BusinessException({
        code: API_ERROR_CODES.AI_THREAD_NOT_FOUND,
        message: 'AI 会话不存在或无权访问',
        status: HttpStatus.NOT_FOUND,
      });
    }
  }

  /** 把请求条数收敛到契约允许的范围，非法值回落到默认值。 */
  private normalizeLimit(limit?: number): number {
    if (!Number.isInteger(limit) || limit === undefined || limit < 1) {
      return AI_MESSAGE_PAGE_DEFAULT_LIMIT;
    }

    return Math.min(limit, AI_MESSAGE_PAGE_MAX_LIMIT);
  }

  /**
   * 把游标转换为 keyset 比较条件。
   * 向更早方向翻页要取“排在上一条之前”的记录，即时间更早，或时间相同但标识更小。
   */
  private toCursorCondition(
    cursor: string | undefined,
    threadId: string,
  ): Prisma.AiMessageWhereInput {
    if (!cursor) {
      return {};
    }

    const position = decodeAiCursor(cursor, {
      kind: AI_CURSOR_KINDS.MESSAGE_LIST,
      scope: threadId,
    });

    return {
      OR: [
        { createdAt: { lt: position.time } },
        { createdAt: position.time, id: { lt: position.id } },
      ],
    };
  }

  /** 把数据库行转换为对外契约；时间统一为 ISO 8601 字符串。 */
  private toHistoryItem(row: AiMessageHistoryRow): AiMessageHistoryItem {
    return {
      id: row.id,
      threadId: row.threadId,
      runId: row.runId,
      authorUserId: row.authorUserId,
      role: row.role,
      dispatchState: row.dispatchState,
      queueSequence: row.queueSequence,
      submissionMode: row.submissionMode,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
      run: row.run ? this.toRunSummary(row.run) : null,
    };
  }

  /** 把 Run 与其工具调用转换为展示快照。 */
  private toRunSummary(
    run: NonNullable<AiMessageHistoryRow['run']>,
  ): AiMessageRun {
    return {
      runId: run.id,
      status: run.status,
      failureReason: run.failureReason as AiMessageRun['failureReason'],
      failureCode: run.failureCode as ApiErrorCode | null,
      cancellationReason:
        run.cancellationReason as AiMessageRun['cancellationReason'],
      toolCalls: run.toolCalls.map((toolCall) => this.toToolCall(toolCall)),
    };
  }

  /** 把工具调用转换为只含名称与状态的摘要。 */
  private toToolCall(
    toolCall: NonNullable<AiMessageHistoryRow['run']>['toolCalls'][number],
  ): AiMessageToolCall {
    return {
      id: toolCall.id,
      toolName: toolCall.toolName,
      status: toolCall.status,
      durationMs: toolCall.durationMs,
      failureCode: toolCall.failureCode as ApiErrorCode | null,
      failureReason: toolCall.failureReason,
    };
  }
}
