/**
 * 本文件负责 Agent Runtime 的实时权限复核、事件补拉和真实决策上下文查询。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  AiAssistantTextDeltaEvent,
  AiDecisionContext,
  AiEvent,
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
import { toAiRunPublicSummary } from '../ai-state.mapper';
import { AiThreadScopeService } from './ai-thread-scope.service';

/** 单次事件补拉允许返回的最大条数。 */
const AI_EVENT_PAGE_SIZE = 500;

@Injectable()
export class AiRuntimeQueryService {
  /** 注入数据库与统一授权查询能力。 */
  constructor(private readonly threadScopeService: AiThreadScopeService) {}

  /** 断言当前用户仍可访问指定 Run 绑定的 Thread 与 Decision。 */
  async assertAccessibleRun(
    authorization: AuthorizationContext,
    runId: string,
  ): Promise<{ threadId: string; decisionId: number }> {
    return this.threadScopeService.assertAccessibleRun(authorization, runId);
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
   * 在用户权限、Thread 绑定和执行租约都有效时返回窄决策上下文。
   * 工具不能借由输入 decisionId 切换到当前 Thread 之外的业务范围。
   */
  async getDecisionContext(
    authorization: AuthorizationContext,
    runId: string,
    executionLeaseId: string,
    decisionId: number,
  ): Promise<AiDecisionContext> {
    const boundScope = await this.assertAccessibleRun(authorization, runId);
    if (boundScope.decisionId !== decisionId) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
        message: '工具请求的决策与当前 AI Thread 不一致',
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
