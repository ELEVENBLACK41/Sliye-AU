/**
 * 本文件负责浏览器侧按 Run 读取状态与事件的受权限保护查询。
 * 所有查询都以 Thread 所有者为条件，越权访问统一返回“不存在或无权访问”，
 * 不通过错误码、耗时或字段差异泄漏其他用户 Run 的存在。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import type { AiEvent, AiRunEventPage } from '@workspace/contracts/ai';
import type { ApiErrorCode } from '@workspace/contracts/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';

/** 单次事件补拉允许返回的最大条数，避免一次性拉取超长历史。 */
const MAX_RUN_EVENT_PAGE_SIZE = 200;

@Injectable()
export class AiRunQueryService {
  /** 注入唯一 Prisma 服务；查询条件始终包含 Thread 所有者。 */
  constructor(private readonly prisma: PrismaService) {}

  /** 读取指定 Run 在断线点之后的事件，并附带当前 Run 状态快照。 */
  async listRunEvents(
    ownerUserId: number,
    threadId: string,
    runId: string,
    afterSequence: number,
  ): Promise<AiRunEventPage> {
    const run = await this.prisma.aiRun.findFirst({
      where: { id: runId, threadId, thread: { ownerUserId } },
      select: {
        id: true,
        threadId: true,
        status: true,
        cancellationReason: true,
        failureReason: true,
        failureCode: true,
      },
    });
    if (!run) {
      throw new BusinessException({
        code: API_ERROR_CODES.AI_RUN_NOT_FOUND,
        message: 'AI 运行不存在或无权访问',
        status: HttpStatus.NOT_FOUND,
      });
    }

    const normalizedAfterSequence = Math.max(0, Math.trunc(afterSequence));
    const events = await this.prisma.aiEvent.findMany({
      where: { runId: run.id, sequence: { gt: normalizedAfterSequence } },
      orderBy: { sequence: 'asc' },
      take: MAX_RUN_EVENT_PAGE_SIZE + 1,
      select: {
        id: true,
        runId: true,
        sequence: true,
        type: true,
        data: true,
        createdAt: true,
      },
    });
    const hasMore = events.length > MAX_RUN_EVENT_PAGE_SIZE;
    const pageEvents = hasMore
      ? events.slice(0, MAX_RUN_EVENT_PAGE_SIZE)
      : events;

    return {
      runId: run.id,
      threadId: run.threadId,
      status: run.status,
      cancellationReason:
        (run.cancellationReason as AiRunEventPage['cancellationReason']) ??
        null,
      failureReason:
        (run.failureReason as AiRunEventPage['failureReason']) ?? null,
      failureCode: (run.failureCode as ApiErrorCode | null) ?? null,
      events: pageEvents.map(
        (event) =>
          ({
            id: event.id,
            runId: event.runId,
            sequence: event.sequence,
            type: event.type,
            data: event.data,
            createdAt: event.createdAt.toISOString(),
          }) as AiEvent,
      ),
      lastSequence: pageEvents.at(-1)?.sequence ?? normalizedAfterSequence,
      hasMore,
    };
  }
}
