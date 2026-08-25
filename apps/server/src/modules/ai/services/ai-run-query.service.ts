/**
 * 本文件负责浏览器侧按 Run 读取状态与事件的受权限保护查询。
 * 所有查询都以 Thread 所有者为条件，越权访问统一返回“不存在或无权访问”，
 * 不通过错误码、耗时或字段差异泄漏其他用户 Run 的存在。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  AiRunCancellationReason,
  AiRunFailureReason,
  AiRunStatus,
} from '@workspace/contracts/ai';
import type { ApiErrorCode } from '@workspace/contracts/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import type { Prisma } from '../../../generated/prisma';

/** 单次事件补拉允许返回的最大条数，避免一次性拉取超长历史。 */
const MAX_RUN_EVENT_PAGE_SIZE = 200;

/** 一条按序号补拉的 Run 事件。 */
export type AiRunEventItem = {
  /** 事件标识。 */
  id: string;
  /** 事件所属 Run 标识。 */
  runId: string;
  /** Run 内严格递增的事件序号。 */
  sequence: number;
  /** 事件类型。 */
  type: string;
  /** 事件结构化负载。 */
  data: Prisma.JsonValue;
  /** 事件持久化时间的 ISO 字符串。 */
  createdAt: string;
};

/** 按序号补拉事件时返回的 Run 快照与事件页。 */
export type AiRunEventPage = {
  /** Run 标识。 */
  runId: string;
  /** Run 所属 Thread 标识。 */
  threadId: string;
  /** Run 当前状态；终态时订阅方应停止补拉。 */
  status: AiRunStatus;
  /** 取消原因；非取消路径为 null。 */
  cancellationReason: AiRunCancellationReason | null;
  /** 失败原因；非失败路径为 null。 */
  failureReason: AiRunFailureReason | null;
  /** 失败业务错误码；非失败路径为 null。 */
  failureCode: ApiErrorCode | null;
  /** 本页事件，按序号升序。 */
  events: AiRunEventItem[];
  /** 本页最后一条事件的序号；本页为空时沿用请求的 afterSequence。 */
  lastSequence: number;
  /** 是否仍有更多事件需要继续补拉。 */
  hasMore: boolean;
};

@Injectable()
export class AiRunQueryService {
  /** 注入唯一 Prisma 服务；查询条件始终包含 Thread 所有者。 */
  constructor(private readonly prisma: PrismaService) {}

  /** 读取指定 Run 在断线点之后的事件，并附带当前 Run 状态快照。 */
  async listRunEvents(
    ownerUserId: number,
    runId: string,
    afterSequence: number,
  ): Promise<AiRunEventPage> {
    const run = await this.prisma.aiRun.findFirst({
      where: { id: runId, thread: { ownerUserId } },
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
        (run.cancellationReason as AiRunCancellationReason | null) ?? null,
      failureReason: (run.failureReason as AiRunFailureReason | null) ?? null,
      failureCode: (run.failureCode as ApiErrorCode | null) ?? null,
      events: pageEvents.map((event) => ({
        id: event.id,
        runId: event.runId,
        sequence: event.sequence,
        type: event.type,
        data: event.data,
        createdAt: event.createdAt.toISOString(),
      })),
      lastSequence:
        pageEvents.at(-1)?.sequence ?? normalizedAfterSequence,
      hasMore,
    };
  }
}
