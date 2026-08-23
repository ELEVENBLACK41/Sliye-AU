/**
 * 本文件负责 AI Thread 历史列表的权限过滤、稳定游标分页和归档筛选。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  AiThreadListItem,
  AiThreadPage,
  ListAiThreadsQuery,
} from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import { AiThreadScopeState, type Prisma } from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';

/** 第一版历史列表默认返回的 Thread 数量。 */
const DEFAULT_AI_THREAD_PAGE_SIZE = 20;
/** 第一版历史列表允许返回的最大 Thread 数量。 */
const MAX_AI_THREAD_PAGE_SIZE = 50;
/** 防御性限制服务端游标的最大字符数。 */
const MAX_AI_THREAD_CURSOR_CHARACTERS = 512;
/** 校验游标中 Thread UUID 的稳定文本格式。 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** 校验 base64url 游标只包含 URL 安全字符。 */
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/;

/** 解码后用于稳定翻页的复合游标。 */
type AiThreadListCursor = {
  /** 上一页最后一条 Thread 的更新时间。 */
  updatedAt: Date;
  /** 相同更新时间下用于确定顺序的 Thread UUID。 */
  id: string;
};

/** 生成只包含稳定排序字段的不透明 base64url 游标。 */
function encodeAiThreadCursor(thread: AiThreadListItem): string {
  return Buffer.from(
    JSON.stringify({ updatedAt: thread.updatedAt, id: thread.id }),
    'utf8',
  ).toString('base64url');
}

/** 把数据库 Thread 记录映射为历史列表允许公开的窄摘要。 */
function toAiThreadListItem(record: {
  id: string;
  decisionId: number;
  title: string;
  activeRunId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AiThreadListItem {
  return {
    id: record.id,
    decisionId: record.decisionId,
    title: record.title,
    activeRunId: record.activeRunId,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

@Injectable()
export class AiThreadHistoryQueryService {
  /** 注入数据库与统一的 Decision 对象级权限查询能力。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** 按当前用户、Decision 权限、归档范围和稳定游标返回 Thread 历史。 */
  async listThreads(
    authorization: AuthorizationContext,
    query: ListAiThreadsQuery,
  ): Promise<AiThreadPage> {
    this.authorizationService.assertPermission(authorization, 'ai:chat:use');
    this.authorizationService.assertPermission(authorization, 'decision:read');

    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    const limit = Math.min(
      query.limit ?? DEFAULT_AI_THREAD_PAGE_SIZE,
      MAX_AI_THREAD_PAGE_SIZE,
    );
    const archiveState = query.archiveState ?? 'active';
    const decisionWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const cursorWhere: Prisma.AiThreadWhereInput | undefined = cursor
      ? {
          OR: [
            { updatedAt: { lt: cursor.updatedAt } },
            { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
          ],
        }
      : undefined;
    const records = await this.prisma.aiThread.findMany({
      where: {
        AND: [
          {
            ownerUserId: authorization.userId,
            scopeState: AiThreadScopeState.ACTIVE,
            archivedAt: archiveState === 'archived' ? { not: null } : null,
            ...(query.decisionId === undefined
              ? {}
              : { decisionId: query.decisionId }),
            decision: { is: decisionWhere },
          },
          ...(cursorWhere ? [cursorWhere] : []),
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        decisionId: true,
        title: true,
        activeRunId: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const hasMore = records.length > limit;
    const items = records.slice(0, limit).map(toAiThreadListItem);

    return {
      items,
      hasMore,
      nextCursor:
        hasMore && items.length > 0
          ? encodeAiThreadCursor(items[items.length - 1])
          : null,
    };
  }

  /** 解码并严格校验不透明复合游标，拒绝伪造或损坏输入。 */
  private decodeCursor(cursor: string): AiThreadListCursor {
    if (
      cursor.length === 0 ||
      cursor.length > MAX_AI_THREAD_CURSOR_CHARACTERS ||
      !BASE64_URL_PATTERN.test(cursor)
    ) {
      this.throwInvalidCursor();
    }

    try {
      const value = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as unknown;

      if (!value || typeof value !== 'object') {
        this.throwInvalidCursor();
      }

      const candidate = value as Record<string, unknown>;
      const updatedAt =
        typeof candidate.updatedAt === 'string'
          ? new Date(candidate.updatedAt)
          : null;
      const id = typeof candidate.id === 'string' ? candidate.id : null;

      if (
        !updatedAt ||
        Number.isNaN(updatedAt.getTime()) ||
        updatedAt.toISOString() !== candidate.updatedAt ||
        !id ||
        !UUID_PATTERN.test(id)
      ) {
        this.throwInvalidCursor();
      }

      return { updatedAt, id };
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      this.throwInvalidCursor();
    }
  }

  /** 抛出不会泄漏游标内部结构的稳定字段校验错误。 */
  private throwInvalidCursor(): never {
    throw new BusinessException({
      code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
      message: 'AI 会话分页游标无效',
      status: HttpStatus.BAD_REQUEST,
      details: [
        {
          field: 'cursor',
          message: '分页游标无效，请重新加载会话列表',
          rule: 'AI_THREAD_CURSOR_INVALID',
        },
      ],
    });
  }
}
