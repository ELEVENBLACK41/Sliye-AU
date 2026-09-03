/**
 * 本文件负责会话置顶：固定列表查询与置顶/取消置顶写入。
 *
 * 固定数量有硬性上限，而“先计数再写入”在默认的 READ COMMITTED 隔离级别下
 * 并不安全——两个并发请求可能同时读到 19 再各写一条，最终突破上限。
 * 因此写入路径先取一把按所有者划分的事务级 advisory lock，把同一用户的
 * 置顶操作串行化。选 advisory lock 而不是锁 User 行，是为了不和登录、
 * 资料更新等无关写入互相阻塞；它随事务自动释放，不需要额外清理。
 *
 * 上限只在写入侧强制，因此固定列表读取永远不会被截断，也就不需要分页。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  AiPinnedThreadList,
  AiThreadListItem,
} from '@workspace/contracts/ai';
import { AI_THREAD_PINNED_MAX } from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../../common/exceptions/business.exception';
import { PrismaService } from '../../../../database/prisma.service';
import { Prisma } from '../../../../generated/prisma';
import {
  AI_THREAD_LIST_ITEM_SELECT,
  toAiThreadListItem,
} from '../../projections/ai-thread.projection';

/**
 * advisory lock 的命名空间，避免与其他业务的 advisory lock 键冲突。
 * 取值本身没有含义，只要求全局唯一且稳定。
 */
const AI_THREAD_PIN_LOCK_NAMESPACE = 4201;

@Injectable()
export class AiThreadPinService {
  /** 注入唯一 Prisma 服务；查询与写入条件始终包含 Thread 所有者。 */
  constructor(private readonly prisma: PrismaService) {}

  /** 按固定时间倒序返回当前用户的全部固定会话。 */
  async listPinnedThreads(ownerUserId: number): Promise<AiPinnedThreadList> {
    const rows = await this.prisma.aiThread.findMany({
      where: { ownerUserId, pinnedAt: { not: null } },
      orderBy: [{ pinnedAt: 'desc' }, { id: 'desc' }],
      select: AI_THREAD_LIST_ITEM_SELECT,
    });

    return {
      items: rows.map(toAiThreadListItem),
      limit: AI_THREAD_PINNED_MAX,
    };
  }

  /**
   * 固定或取消固定一个会话。
   * 重复设置为同一状态是幂等的：不写库、不报错、不改变原有固定时间。
   */
  async setThreadPinned(
    ownerUserId: number,
    threadId: string,
    pinned: boolean,
  ): Promise<AiThreadListItem> {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockOwnerPinBudget(transaction, ownerUserId);

      const thread = await transaction.aiThread.findFirst({
        where: { id: threadId, ownerUserId },
        select: AI_THREAD_LIST_ITEM_SELECT,
      });
      if (!thread) {
        throw new BusinessException({
          code: API_ERROR_CODES.AI_THREAD_NOT_FOUND,
          message: 'AI 会话不存在或无权访问',
          status: HttpStatus.NOT_FOUND,
        });
      }

      const isPinned = thread.pinnedAt !== null;
      if (isPinned === pinned) {
        return toAiThreadListItem(thread);
      }
      if (pinned) {
        await this.assertPinnable(transaction, thread.archivedAt, ownerUserId);
      }

      const updated = await transaction.aiThread.update({
        where: { id: thread.id },
        data: {
          pinnedAt: pinned ? new Date() : null,
          // 置顶不是会话内容的变化，显式保留原值，避免取消置顶后
          // 这条会话凭空跳到“最近”列表最前面。
          updatedAt: thread.updatedAt,
        },
        select: AI_THREAD_LIST_ITEM_SELECT,
      });

      return toAiThreadListItem(updated);
    });
  }

  /**
   * 取一把按所有者划分的事务级 advisory lock，串行化同一用户的置顶写入。
   * 锁在事务提交或回滚时自动释放。
   */
  private async lockOwnerPinBudget(
    transaction: Prisma.TransactionClient,
    ownerUserId: number,
  ): Promise<void> {
    await transaction.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(${AI_THREAD_PIN_LOCK_NAMESPACE}::int, ${ownerUserId}::int)
    `);
  }

  /** 校验会话可被固定：未归档，且固定数量未达上限。 */
  private async assertPinnable(
    transaction: Prisma.TransactionClient,
    archivedAt: Date | null,
    ownerUserId: number,
  ): Promise<void> {
    if (archivedAt !== null) {
      throw new BusinessException({
        code: API_ERROR_CODES.AI_THREAD_ARCHIVED,
        message: '已归档的会话不能固定，请先恢复该会话',
        status: HttpStatus.CONFLICT,
      });
    }

    const pinnedCount = await transaction.aiThread.count({
      where: { ownerUserId, pinnedAt: { not: null } },
    });
    if (pinnedCount >= AI_THREAD_PINNED_MAX) {
      throw new BusinessException({
        code: API_ERROR_CODES.AI_THREAD_PINNED_LIMIT_EXCEEDED,
        message: `最多只能固定 ${AI_THREAD_PINNED_MAX} 个会话，请先取消其他固定`,
        status: HttpStatus.CONFLICT,
      });
    }
  }
}
