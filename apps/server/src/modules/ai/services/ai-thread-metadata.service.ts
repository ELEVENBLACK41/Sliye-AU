/**
 * 本文件负责会话元数据变更：重命名、归档与恢复。
 *
 * 三个操作都**不推进 `updatedAt`**：它是“最近”列表的排序键，只应由会话活动
 * （新消息、Run 状态变化）推进。否则改个标题就会让陈旧会话跳到列表最前面。
 *
 * 归档要求会话当前没有活跃 Run。判断与写入在同一事务内、并持有 Thread 行锁，
 * 与创建消息走同一把锁，避免“检查时空闲、写入时已产生新 Run”的竞态。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import type { AiThreadListItem } from '@workspace/contracts/ai';
import { AI_THREAD_TITLE_MAX_LENGTH } from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import type { Prisma } from '../../../generated/prisma';
import { AiQueueService } from './ai-queue.service';
import {
  AI_THREAD_LIST_ITEM_SELECT,
  toAiThreadListItem,
} from './ai-thread-projection';

@Injectable()
export class AiThreadMetadataService {
  /** 注入 Prisma 与队列服务；队列服务提供与消息入队相同的 Thread 行锁。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: AiQueueService,
  ) {}

  /** 重命名会话；标题去除两端空白后不得为空，且不改变最后活动时间。 */
  async renameThread(
    ownerUserId: number,
    threadId: string,
    title: string,
  ): Promise<AiThreadListItem> {
    const normalizedTitle = this.normalizeTitle(title);

    return this.prisma.$transaction(async (transaction) => {
      const thread = await this.findOwnedThread(
        transaction,
        ownerUserId,
        threadId,
      );
      const updated = await transaction.aiThread.update({
        where: { id: thread.id },
        data: { title: normalizedTitle, updatedAt: thread.updatedAt },
        select: AI_THREAD_LIST_ITEM_SELECT,
      });

      return toAiThreadListItem(updated);
    });
  }

  /**
   * 归档或恢复会话。
   * 归档要求没有活跃 Run，并同时清除固定状态；恢复不会自动重新固定。
   * 重复设置为同一状态是幂等的：不写库、不报错。
   */
  async setThreadArchived(
    ownerUserId: number,
    threadId: string,
    archived: boolean,
  ): Promise<AiThreadListItem> {
    return this.prisma.$transaction(async (transaction) => {
      // 与创建消息共用同一把 Thread 行锁，避免归档判断与新 Run 创建互相穿插。
      const locked = await this.queueService.lockThread(
        transaction,
        threadId,
        ownerUserId,
      );
      if (!locked) {
        throw this.createThreadNotFoundException();
      }

      const thread = await transaction.aiThread.findUniqueOrThrow({
        where: { id: locked.id },
        select: AI_THREAD_LIST_ITEM_SELECT,
      });
      const isArchived = thread.archivedAt !== null;
      if (isArchived === archived) {
        return toAiThreadListItem(thread);
      }
      if (archived && locked.activeRunId !== null) {
        throw new BusinessException({
          code: API_ERROR_CODES.AI_THREAD_RUN_ACTIVE,
          message: '该会话仍有正在执行的运行，请先停止后再归档',
          status: HttpStatus.CONFLICT,
        });
      }

      const updated = await transaction.aiThread.update({
        where: { id: thread.id },
        data: {
          archivedAt: archived ? new Date() : null,
          // 归档与固定互斥；恢复时保持未固定，由用户决定是否重新固定。
          pinnedAt: archived ? null : thread.pinnedAt,
          updatedAt: thread.updatedAt,
        },
        select: AI_THREAD_LIST_ITEM_SELECT,
      });

      return toAiThreadListItem(updated);
    });
  }

  /** 校验并归一化用户提交的标题。 */
  private normalizeTitle(title: string): string {
    const normalized = title.trim().replace(/\s+/g, ' ');
    if (normalized.length === 0) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
        message: '会话标题不能为空',
        status: HttpStatus.BAD_REQUEST,
      });
    }

    return normalized.slice(0, AI_THREAD_TITLE_MAX_LENGTH);
  }

  /** 查询当前用户拥有的会话；不存在或非所有者统一返回不存在。 */
  private async findOwnedThread(
    transaction: Prisma.TransactionClient,
    ownerUserId: number,
    threadId: string,
  ) {
    const thread = await transaction.aiThread.findFirst({
      where: { id: threadId, ownerUserId },
      select: AI_THREAD_LIST_ITEM_SELECT,
    });
    if (!thread) {
      throw this.createThreadNotFoundException();
    }

    return thread;
  }

  /** 创建不泄露其他用户会话存在性的未找到异常。 */
  private createThreadNotFoundException(): BusinessException {
    return new BusinessException({
      code: API_ERROR_CODES.AI_THREAD_NOT_FOUND,
      message: 'AI 会话不存在或无权访问',
      status: HttpStatus.NOT_FOUND,
    });
  }
}
