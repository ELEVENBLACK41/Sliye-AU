/**
 * 本文件负责 AI 用户输入的队列序号分配、队首领取与定向请求替代事务。
 * 它只维护持久化状态，不触发执行器取消、模型调用或 HTTP 推送。
 */

import { Injectable } from '@nestjs/common';
import {
  AiMessageDispatchState,
  AiRunStatus,
  Prisma,
} from '../../../generated/prisma';
import { assertAiMessageDispatchStateTransition } from '../state/ai-message-state-transition';

/** 一次成功领取队首输入后创建的 Run 与消息标识。 */
export type ClaimedAiQueueMessage = {
  /** 被领取并转为已分发状态的用户消息标识。 */
  messageId: string;
  /** 该用户消息创建出的唯一排队 Run 标识。 */
  runId: string;
};

@Injectable()
export class AiQueueService {
  /** 锁定当前用户拥有的 Thread，串行化入队、替代和队首领取。 */
  async lockThread(
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

  /** 为已经锁定的 Thread 原子分配下一条用户输入的稳定队列序号。 */
  async allocateQueueSequence(
    transaction: Prisma.TransactionClient,
    threadId: string,
  ): Promise<number> {
    const thread = await transaction.aiThread.update({
      where: { id: threadId },
      data: { nextQueueSequence: { increment: 1 } },
      select: { nextQueueSequence: true },
    });

    return thread.nextQueueSequence - 1;
  }

  /** 将当前 Thread 中尚未领取的用户输入保留为审计记录并标记为已被新方向替代。 */
  async supersedeQueuedMessages(
    transaction: Prisma.TransactionClient,
    threadId: string,
  ): Promise<void> {
    assertAiMessageDispatchStateTransition('QUEUED', 'SUPERSEDED');
    await transaction.aiMessage.updateMany({
      where: {
        threadId,
        dispatchState: AiMessageDispatchState.QUEUED,
      },
      data: { dispatchState: AiMessageDispatchState.SUPERSEDED },
    });
  }

  /**
   * 在没有活跃 Run 的前提下只领取队列中序号最小的一条用户输入。
   * 调用方必须已经通过 lockThread 持有同一 Thread 的行锁。
   */
  async claimNextQueuedMessage(
    transaction: Prisma.TransactionClient,
    threadId: string,
  ): Promise<ClaimedAiQueueMessage | null> {
    const thread = await transaction.aiThread.findUnique({
      where: { id: threadId },
      select: { activeRunId: true },
    });
    if (!thread || thread.activeRunId) {
      return null;
    }

    const message = await transaction.aiMessage.findFirst({
      where: {
        threadId,
        dispatchState: AiMessageDispatchState.QUEUED,
      },
      orderBy: { queueSequence: 'asc' },
      select: {
        id: true,
        requestedModelRole: true,
      },
    });
    if (!message || !message.requestedModelRole) {
      return null;
    }

    assertAiMessageDispatchStateTransition('QUEUED', 'DISPATCHED');
    const claimed = await transaction.aiMessage.updateMany({
      where: {
        id: message.id,
        dispatchState: AiMessageDispatchState.QUEUED,
      },
      data: { dispatchState: AiMessageDispatchState.DISPATCHED },
    });
    if (claimed.count !== 1) {
      return null;
    }

    const run = await transaction.aiRun.create({
      data: {
        threadId,
        userMessageId: message.id,
        status: AiRunStatus.QUEUED,
        modelRole: message.requestedModelRole,
      },
    });
    await transaction.aiThread.update({
      where: { id: threadId },
      data: { activeRunId: run.id },
    });

    return { messageId: message.id, runId: run.id };
  }
}
