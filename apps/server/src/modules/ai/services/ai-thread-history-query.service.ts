/**
 * 本文件负责 AI Thread 历史列表、详情、消息恢复与白名单更新。
 * 所有浏览器读取都重新校验 Thread owner 和当前 Decision 访问权，并只返回安全字段。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  AiThreadDetail,
  AiThreadMessagePage,
  AiThreadPage,
  ListAiThreadMessagesQuery,
  ListAiThreadsQuery,
  UpdateAiThreadRequest,
  UpdateAiThreadResponse,
} from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { AiThreadScopeState, type Prisma } from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import {
  type AiThreadHistoryRecord,
  aiThreadHistorySelect,
  aiThreadMessageHistorySelect,
  toAiThreadDetail,
  toAiThreadListItem,
  toAiThreadMessageHistoryItem,
} from '../ai-thread-history.mapper';
import { AiThreadScopeService } from './ai-thread-scope.service';

/** 第一版历史列表默认返回的 Thread 数量。 */
const DEFAULT_AI_THREAD_PAGE_SIZE = 20;
/** 第一版历史列表允许返回的最大 Thread 数量。 */
const MAX_AI_THREAD_PAGE_SIZE = 50;
/** 第一版消息历史默认返回的消息数量。 */
const DEFAULT_AI_MESSAGE_PAGE_SIZE = 30;
/** 第一版消息历史允许返回的最大消息数量。 */
const MAX_AI_MESSAGE_PAGE_SIZE = 100;
/** 第一版用户可编辑 Thread 标题的 Unicode 字符上限。 */
const MAX_AI_THREAD_TITLE_CHARACTERS = 60;
/** 防御性限制服务端游标的最大字符数。 */
const MAX_AI_CURSOR_CHARACTERS = 512;
/** 校验 Thread、Message 和 Run UUID 的稳定文本格式。 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** 校验 base64url 游标只包含 URL 安全字符。 */
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/;

/** 解码后用于稳定翻页的时间与 UUID 复合游标。 */
type AiTimestampCursor = {
  /** 上一页边界记录的排序时间。 */
  timestamp: Date;
  /** 相同时间下用于确定顺序的 UUID。 */
  id: string;
};

/** 生成只包含稳定排序字段的不透明 base64url 游标。 */
function encodeTimestampCursor(
  field: 'updatedAt' | 'createdAt',
  timestamp: string,
  id: string,
): string {
  return Buffer.from(
    JSON.stringify({ [field]: timestamp, id }),
    'utf8',
  ).toString('base64url');
}

@Injectable()
export class AiThreadHistoryQueryService {
  /** 注入 Decision 对象级授权规则与 Thread 来源范围事务。 */
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly threadScopeService: AiThreadScopeService,
  ) {}

  /** 按当前用户、Decision 权限、归档范围和稳定游标返回 Thread 历史。 */
  async listThreads(
    authorization: AuthorizationContext,
    query: ListAiThreadsQuery,
  ): Promise<AiThreadPage> {
    this.assertHistoryPermissions(authorization);

    const cursor = query.cursor
      ? this.decodeCursor(query.cursor, 'updatedAt', 'AI_THREAD_CURSOR_INVALID')
      : null;
    const limit = Math.max(
      1,
      Math.min(
        query.limit ?? DEFAULT_AI_THREAD_PAGE_SIZE,
        MAX_AI_THREAD_PAGE_SIZE,
      ),
    );
    const archiveState = query.archiveState ?? 'active';
    const decisionWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const cursorWhere: Prisma.AiThreadWhereInput | undefined = cursor
      ? {
          OR: [
            { updatedAt: { lt: cursor.timestamp } },
            { updatedAt: cursor.timestamp, id: { lt: cursor.id } },
          ],
        }
      : undefined;
    const records = await this.threadScopeService.withRevalidatedOwnedThreads(
      authorization,
      query.decisionId,
      (tx) =>
        tx.aiThread.findMany({
          where: {
            AND: [
              {
                ownerUserId: authorization.userId,
                scopeState: AiThreadScopeState.ACTIVE,
                archivedAt: archiveState === 'archived' ? { not: null } : null,
                ...(query.decisionId === undefined
                  ? {}
                  : {
                      OR: [
                        { decisionId: query.decisionId },
                        {
                          runs: {
                            some: {
                              decisionScopes: {
                                some: { decisionId: query.decisionId },
                              },
                            },
                          },
                        },
                      ],
                    }),
                AND: [
                  {
                    OR: [
                      { decision: { is: decisionWhere } },
                      {
                        runs: {
                          some: {
                            decisionScopes: {
                              some: { decision: { is: decisionWhere } },
                            },
                          },
                        },
                      },
                      {
                        decisionId: null,
                        runs: {
                          none: { decisionScopes: { some: {} } },
                        },
                      },
                    ],
                  },
                ],
              },
              ...(cursorWhere ? [cursorWhere] : []),
            ],
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          select: aiThreadHistorySelect,
        }),
    );
    const hasMore = records.length > limit;
    const items = records.slice(0, limit).map(toAiThreadListItem);
    const lastItem = items.at(-1);

    return {
      items,
      hasMore,
      nextCursor:
        hasMore && lastItem
          ? encodeTimestampCursor('updatedAt', lastItem.updatedAt, lastItem.id)
          : null,
    };
  }

  /** 重新校验 owner 与 Decision 访问权后返回 Thread 安全详情。 */
  async getThreadDetail(
    authorization: AuthorizationContext,
    threadId: string,
  ): Promise<AiThreadDetail> {
    const record = await this.findAccessibleThread(authorization, threadId);
    return toAiThreadDetail(record);
  }

  /** 重新鉴权后按稳定游标返回消息、Run、工具调用和来源关联。 */
  async listThreadMessages(
    authorization: AuthorizationContext,
    threadId: string,
    query: ListAiThreadMessagesQuery,
  ): Promise<AiThreadMessagePage> {
    const cursor = query.cursor
      ? this.decodeCursor(
          query.cursor,
          'createdAt',
          'AI_THREAD_MESSAGE_CURSOR_INVALID',
        )
      : null;
    const limit = Math.max(
      1,
      Math.min(
        query.limit ?? DEFAULT_AI_MESSAGE_PAGE_SIZE,
        MAX_AI_MESSAGE_PAGE_SIZE,
      ),
    );
    const cursorWhere: Prisma.AiMessageWhereInput | undefined = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.timestamp } },
            { createdAt: cursor.timestamp, id: { lt: cursor.id } },
          ],
        }
      : undefined;
    const records = await this.threadScopeService.withAccessibleThread(
      authorization,
      threadId,
      [],
      (tx) =>
        tx.aiMessage.findMany({
          where: {
            AND: [{ threadId }, ...(cursorWhere ? [cursorWhere] : [])],
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          select: aiThreadMessageHistorySelect,
        }),
    );
    const hasMore = records.length > limit;
    const pageRecords = records.slice(0, limit);
    const oldestRecord = pageRecords.at(-1);

    return {
      items: pageRecords.reverse().map(toAiThreadMessageHistoryItem),
      hasMore,
      nextCursor:
        hasMore && oldestRecord
          ? encodeTimestampCursor(
              'createdAt',
              oldestRecord.createdAt.toISOString(),
              oldestRecord.id,
            )
          : null,
    };
  }

  /** 只更新标题与归档时间白名单，并返回重新鉴权后的安全详情。 */
  async updateThread(
    authorization: AuthorizationContext,
    threadId: string,
    request: UpdateAiThreadRequest,
  ): Promise<UpdateAiThreadResponse> {
    const title =
      request.title === undefined
        ? undefined
        : this.normalizeTitle(request.title);

    if (title === undefined && request.archived === undefined) {
      this.throwValidationError(
        'body',
        '至少需要提供 title 或 archived 字段',
        'AI_THREAD_UPDATE_EMPTY',
      );
    }

    const updated = await this.threadScopeService.withAccessibleThread(
      authorization,
      threadId,
      [],
      async (tx) => {
        const current = await tx.aiThread.findUniqueOrThrow({
          where: { id: threadId },
          select: { archivedAt: true },
        });
        await tx.aiThread.update({
          where: { id: threadId },
          data: {
            ...(title === undefined ? {} : { title }),
            ...(request.archived === undefined
              ? {}
              : {
                  archivedAt: request.archived
                    ? (current.archivedAt ?? new Date())
                    : null,
                }),
          },
        });
        return tx.aiThread.findUniqueOrThrow({
          where: { id: threadId },
          select: aiThreadHistorySelect,
        });
      },
    );

    return { thread: toAiThreadDetail(updated) };
  }

  /** 读取当前 owner 且仍有 Decision 权限的 ACTIVE Thread。 */
  private async findAccessibleThread(
    authorization: AuthorizationContext,
    threadId: string,
  ): Promise<AiThreadHistoryRecord> {
    this.assertHistoryPermissions(authorization);
    this.assertUuid(threadId, 'threadId');
    return this.threadScopeService.withAccessibleThread(
      authorization,
      threadId,
      [],
      async (tx) =>
        tx.aiThread.findUniqueOrThrow({
          where: { id: threadId },
          select: aiThreadHistorySelect,
        }),
    );
  }

  /** 校验历史接口要求的系统权限，避免服务层被绕过调用。 */
  private assertHistoryPermissions(authorization: AuthorizationContext): void {
    this.authorizationService.assertPermission(authorization, 'ai:chat:use');
    this.authorizationService.assertPermission(authorization, 'decision:read');
  }

  /** 规范化 Thread 标题，并按 Unicode code point 校验 1～60 字符。 */
  private normalizeTitle(title: string): string {
    if (typeof title !== 'string') {
      this.throwValidationError(
        'title',
        'AI 会话标题必须是字符串',
        'AI_THREAD_TITLE_INVALID',
      );
    }

    const normalized = title.trim();
    const characterCount = Array.from(normalized).length;
    if (
      characterCount === 0 ||
      characterCount > MAX_AI_THREAD_TITLE_CHARACTERS
    ) {
      this.throwValidationError(
        'title',
        `AI 会话标题必须包含 1～${MAX_AI_THREAD_TITLE_CHARACTERS} 个字符`,
        'AI_THREAD_TITLE_LENGTH',
      );
    }

    return normalized;
  }

  /** 防御性校验 UUID 路径参数，避免无效文本进入 PostgreSQL UUID 比较。 */
  private assertUuid(value: string, field: string): void {
    if (!UUID_PATTERN.test(value)) {
      this.throwValidationError(
        field,
        `${field} 必须是有效 UUID`,
        'AI_THREAD_UUID_INVALID',
      );
    }
  }

  /** 解码并严格校验不透明复合游标，拒绝伪造或损坏输入。 */
  private decodeCursor(
    cursor: string,
    timestampField: 'updatedAt' | 'createdAt',
    rule: string,
  ): AiTimestampCursor {
    if (
      cursor.length === 0 ||
      cursor.length > MAX_AI_CURSOR_CHARACTERS ||
      !BASE64_URL_PATTERN.test(cursor)
    ) {
      this.throwInvalidCursor(rule);
    }

    try {
      const value = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as unknown;
      if (!value || typeof value !== 'object') {
        this.throwInvalidCursor(rule);
      }

      const candidate = value as Record<string, unknown>;
      const rawTimestamp = candidate[timestampField];
      const timestamp =
        typeof rawTimestamp === 'string' ? new Date(rawTimestamp) : null;
      const id = typeof candidate.id === 'string' ? candidate.id : null;

      if (
        !timestamp ||
        Number.isNaN(timestamp.getTime()) ||
        timestamp.toISOString() !== rawTimestamp ||
        !id ||
        !UUID_PATTERN.test(id)
      ) {
        this.throwInvalidCursor(rule);
      }

      return { timestamp, id };
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      this.throwInvalidCursor(rule);
    }
  }

  /** 抛出不会泄漏游标内部结构的稳定字段校验错误。 */
  private throwInvalidCursor(rule: string): never {
    this.throwValidationError('cursor', '分页游标无效，请重新加载历史', rule);
  }

  /** 抛出稳定的字段级历史接口校验错误。 */
  private throwValidationError(
    field: string,
    message: string,
    rule: string,
  ): never {
    throw new BusinessException({
      code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
      message,
      status: HttpStatus.BAD_REQUEST,
      details: [{ field, message, rule }],
    });
  }
}
