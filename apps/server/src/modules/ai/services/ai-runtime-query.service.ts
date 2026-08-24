/**
 * 本文件负责 Agent Runtime 的实时权限复核、事件补拉和真实决策上下文查询。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  AiAssistantTextDeltaEvent,
  AiDecisionContext,
  AiEvent,
  AiRunCreation,
  AiRunEventPage,
  AiRunStatusChangedEvent,
} from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import {
  AiRunStatus,
  AiSourceDependencyUsage,
  type AiEvent as PrismaAiEvent,
} from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import {
  toAiMessage,
  toAiRunPublicSummary,
  toAiThread,
} from '../ai-state.mapper';
import { AiThreadScopeService } from './ai-thread-scope.service';

/** 单次事件补拉允许返回的最大条数。 */
const AI_EVENT_PAGE_SIZE = 500;

@Injectable()
export class AiRuntimeQueryService {
  /** 注入数据库与统一授权查询能力。 */
  constructor(private readonly threadScopeService: AiThreadScopeService) {}

  /** 断言当前用户仍可访问指定 Run 的 Thread 与全部已确认 Decision。 */
  async assertAccessibleRun(
    authorization: AuthorizationContext,
    runId: string,
  ): Promise<{ threadId: string; decisionIds: number[] }> {
    return this.threadScopeService.assertAccessibleRun(authorization, runId);
  }

  /** 为已创建的排队 Run 恢复 BFF 启动执行所需的权威 Thread、消息和 Run。 */
  async getRunExecutionPreparation(
    authorization: AuthorizationContext,
    runId: string,
  ): Promise<AiRunCreation> {
    return this.threadScopeService.withAccessibleRun(
      authorization,
      runId,
      [],
      async (tx) => {
        const run = await tx.aiRun.findUniqueOrThrow({
          where: { id: runId },
          include: { thread: true, userMessage: true },
        });
        return {
          thread: toAiThread(run.thread),
          message: toAiMessage(run.userMessage),
          run: toAiRunPublicSummary(run),
          replayed: run.status !== AiRunStatus.QUEUED,
        };
      },
    );
  }

  /** 重新鉴权后按序补拉指定 Run 的持久化事件，且绝不启动执行器。 */
  async getRunEvents(
    authorization: AuthorizationContext,
    threadId: string,
    runId: string,
    afterSequence: number,
  ): Promise<AiRunEventPage> {
    return this.threadScopeService.withAccessibleRun(
      authorization,
      runId,
      [],
      async (tx, accessible) => {
        if (accessible.threadId !== threadId) {
          this.throwRunNotFound();
        }

        const [run, eventCandidates] = await Promise.all([
          tx.aiRun.findUniqueOrThrow({ where: { id: runId } }),
          tx.aiEvent.findMany({
            where: { runId, sequence: { gt: afterSequence } },
            orderBy: { sequence: 'asc' },
            take: AI_EVENT_PAGE_SIZE + 1,
          }),
        ]);
        const hasMore = eventCandidates.length > AI_EVENT_PAGE_SIZE;
        const events = eventCandidates.slice(0, AI_EVENT_PAGE_SIZE);

        return {
          threadId,
          run: toAiRunPublicSummary(run),
          events: events.map((event) => this.toAiEvent(event)),
          lastSequence: events.at(-1)?.sequence ?? afterSequence,
          hasMore,
        };
      },
    );
  }

  /**
   * 在用户权限、Run 已确认范围和执行租约都有效时返回窄决策上下文。
   * 工具只能从当前 Run 的一个或多个已确认 Decision 中选择。
   */
  async getDecisionContext(
    authorization: AuthorizationContext,
    runId: string,
    executionLeaseId: string,
    decisionId: number,
  ): Promise<AiDecisionContext> {
    const boundScope = await this.assertAccessibleRun(authorization, runId);
    if (!boundScope.decisionIds.includes(decisionId)) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
        message: '工具请求的决策不在当前 AI Run 已确认范围内',
        status: HttpStatus.BAD_REQUEST,
      });
    }
    const sourceId = `decision:${decisionId}`;
    return this.threadScopeService.withAccessibleRun(
      authorization,
      runId,
      [sourceId],
      async (tx) => {
        const fencedRun = await tx.aiRun.findFirst({
          where: {
            id: runId,
            status: AiRunStatus.RUNNING,
            executionLeaseId,
            executionLeaseExpiresAt: { gt: new Date() },
          },
          select: { id: true },
        });
        if (!fencedRun) {
          throw new BusinessException({
            code: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
            message: 'AI 工具调用使用的执行租约已经失效',
            status: HttpStatus.CONFLICT,
          });
        }

        const decision = await tx.decision.findUniqueOrThrow({
          where: { id: decisionId },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            project: { select: { id: true, title: true } },
            area: { select: { id: true, name: true, type: true } },
            department: { select: { id: true, code: true, name: true } },
            _count: { select: { participants: true } },
          },
        });
        await this.threadScopeService.registerSourceDependencies(
          tx,
          runId,
          AiSourceDependencyUsage.TOOL_READ,
          [sourceId],
        );

        return {
          decision: {
            id: decision.id,
            title: decision.title,
            description: decision.description,
            status: decision.status,
            participantCount: decision._count.participants,
            createdAt: decision.createdAt.toISOString(),
            updatedAt: decision.updatedAt.toISOString(),
          },
          project: decision.project,
          area: decision.area,
          department: decision.department,
          sources: [
            {
              sourceId,
              sourceType: 'DECISION' as const,
              title: decision.title,
            },
          ],
        };
      },
    );
  }

  /** 把数据库事件负载恢复为共享可判别联合。 */
  private toAiEvent(event: PrismaAiEvent): AiEvent {
    const base = {
      id: event.id,
      runId: event.runId,
      sequence: event.sequence,
      createdAt: event.createdAt.toISOString(),
    };

    if (event.type === 'ASSISTANT_TEXT_DELTA') {
      return {
        ...base,
        type: event.type,
        data: event.payload as AiAssistantTextDeltaEvent['data'],
      };
    }

    return {
      ...base,
      type: event.type,
      data: event.payload as AiRunStatusChangedEvent['data'],
    };
  }

  /** 对不存在和无权访问统一返回 Not Found，避免资源枚举。 */
  private throwRunNotFound(): never {
    throw new BusinessException({
      code: API_ERROR_CODES.AI_RUN_NOT_FOUND,
      message: 'AI 运行不存在或当前账号无权访问',
      status: HttpStatus.NOT_FOUND,
    });
  }
}
