/**
 * 本文件负责 AI 会话历史的只读查询：Thread 游标分页列表与 Thread 详情。
 *
 * 所有查询都以 Thread 所有者为硬性条件，越权访问统一表现为“不存在”，
 * 不区分“无权”与“不存在”，避免通过错误码探测他人 Thread 是否存在。
 * 列表只返回未固定会话；固定会话数量有上限、由独立接口一次性返回，
 * 因此分页始终只有 `updatedAt` 一个排序键。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  AiThreadDetail,
  AiThreadListFilter,
  AiThreadPage,
} from '@workspace/contracts/ai';
import {
  AI_THREAD_PAGE_DEFAULT_LIMIT,
  AI_THREAD_PAGE_MAX_LIMIT,
} from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import type { Prisma } from '../../../generated/prisma';
import { isAiRunNonTerminalStatus } from '../state/ai-run.machine';
import { AI_CURSOR_KINDS, decodeAiCursor, encodeAiCursor } from './ai-cursor';
import {
  AI_THREAD_LIST_ITEM_SELECT,
  toAiThreadListItem,
} from './ai-thread-projection';

@Injectable()
export class AiThreadQueryService {
  /** 注入唯一 Prisma 服务；查询条件始终包含 Thread 所有者。 */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 按最后活动时间倒序返回当前用户的未固定会话。
   * 使用 keyset 分页而不是 offset：翻页期间新会话产生变化时不会导致重复或漏项。
   */
  async listThreads(
    ownerUserId: number,
    query: { cursor?: string; limit?: number; filter?: AiThreadListFilter },
  ): Promise<AiThreadPage> {
    const filter = query.filter ?? 'ACTIVE';
    const limit = this.normalizeLimit(query.limit);
    const where: Prisma.AiThreadWhereInput = {
      ownerUserId,
      pinnedAt: null,
      ...this.toArchivedCondition(filter),
      ...this.toCursorCondition(query.cursor, filter),
    };

    // 多取一条用于判断是否还有下一页，返回前再截断到请求的条数。
    const rows = await this.prisma.aiThread.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: AI_THREAD_LIST_ITEM_SELECT,
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastItem = items.at(-1);

    return {
      items: items.map(toAiThreadListItem),
      nextCursor:
        hasMore && lastItem
          ? encodeAiCursor({
              kind: AI_CURSOR_KINDS.THREAD_LIST,
              scope: filter,
              time: lastItem.updatedAt,
              id: lastItem.id,
            })
          : null,
      hasMore,
    };
  }

  /**
   * 读取单条会话详情，附带当前活跃 Run 快照。
   * 活跃 Run 按定义为非终态；查询到终态说明活跃指针尚未清理，此时按“无活跃 Run”返回。
   */
  async getThreadDetail(
    ownerUserId: number,
    threadId: string,
  ): Promise<AiThreadDetail> {
    const thread = await this.prisma.aiThread.findFirst({
      where: { id: threadId, ownerUserId },
      select: {
        ...AI_THREAD_LIST_ITEM_SELECT,
        activeRun: { select: { id: true, status: true, createdAt: true } },
      },
    });
    if (!thread) {
      throw new BusinessException({
        code: API_ERROR_CODES.AI_THREAD_NOT_FOUND,
        message: 'AI 会话不存在或无权访问',
        status: HttpStatus.NOT_FOUND,
      });
    }

    const activeRun = thread.activeRun;

    return {
      ...toAiThreadListItem(thread),
      activeRun:
        activeRun && isAiRunNonTerminalStatus(activeRun.status)
          ? {
              runId: activeRun.id,
              status: activeRun.status,
              createdAt: activeRun.createdAt.toISOString(),
            }
          : null,
    };
  }

  /** 把请求条数收敛到契约允许的范围，非法值回落到默认值。 */
  private normalizeLimit(limit?: number): number {
    if (!Number.isInteger(limit) || limit === undefined || limit < 1) {
      return AI_THREAD_PAGE_DEFAULT_LIMIT;
    }

    return Math.min(limit, AI_THREAD_PAGE_MAX_LIMIT);
  }

  /** 把归档筛选条件转换为查询片段；`ALL` 不附加任何条件。 */
  private toArchivedCondition(
    filter: AiThreadListFilter,
  ): Prisma.AiThreadWhereInput {
    if (filter === 'ACTIVE') {
      return { archivedAt: null };
    }
    if (filter === 'ARCHIVED') {
      return { archivedAt: { not: null } };
    }

    return {};
  }

  /**
   * 把游标转换为 keyset 比较条件。
   * 倒序分页要取“排在上一条之后”的记录，即时间更早，或时间相同但标识更小。
   */
  private toCursorCondition(
    cursor: string | undefined,
    filter: AiThreadListFilter,
  ): Prisma.AiThreadWhereInput {
    if (!cursor) {
      return {};
    }

    const position = decodeAiCursor(cursor, {
      kind: AI_CURSOR_KINDS.THREAD_LIST,
      scope: filter,
    });

    return {
      OR: [
        { updatedAt: { lt: position.time } },
        { updatedAt: position.time, id: { lt: position.id } },
      ],
    };
  }
}
