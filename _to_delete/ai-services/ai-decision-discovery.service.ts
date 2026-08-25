/**
 * 本文件实现 2.4-C 的 `findDecisionCandidates` 只读工具业务逻辑：
 * 只按当前用户实时可访问范围查询 Decision 标题或主键，返回受控数量的候选摘要。
 * 本服务不读取讨论正文、提案、投票或会议内容，也不做模型串联、HTTP 或 UI 接入。
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { Prisma } from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import { AiPermissionPolicyService } from '../policies/ai-permission-policy';
import type { AiToolExecutionContext } from '../types/ai-tool-registry.types';
import type {
  FindDecisionCandidatesInput,
  FindDecisionCandidatesResult,
} from '../types/ai-decision-discovery.types';
import { assertAiRequiredText } from './ai-persistence.utils';

/** 单次调用最多返回的候选决策数量，避免向模型上下文注入过量数据。 */
const MAX_DECISION_CANDIDATES = 5;

/** Decision 读取权限码，与决策中心现有查询复用同一个数据范围判断。 */
const DECISION_READ_PERMISSION = 'decision:read';

@Injectable()
export class AiDecisionDiscoveryService {
  /** 注入数据库、统一授权服务与 AI 权限上下文构造服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
    private readonly permissionPolicy: AiPermissionPolicyService,
  ) {}

  /**
   * 按查询词在当前用户可访问范围内查找候选 Decision。
   * 权限过滤在 SQL 层面完成，未授权记录不会进入结果集，
   * 因此候选数量、顺序和空结果都不会泄漏无权 Decision 的存在。
   */
  async findDecisionCandidates(
    executionContext: AiToolExecutionContext,
    input: FindDecisionCandidatesInput,
  ): Promise<FindDecisionCandidatesResult> {
    assertAiRequiredText(input.query, '决策发现查询词');
    const trimmedQuery = input.query.trim();

    const authorization = await this.permissionPolicy.buildAuthorizationContext(
      executionContext.ownerUserId,
    );
    const decisionWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      DECISION_READ_PERMISSION,
    );

    const decisions = await this.prisma.decision.findMany({
      where: this.buildQueryWhere(decisionWhere, trimmedQuery),
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        project: { select: { title: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: MAX_DECISION_CANDIDATES,
    });

    return {
      candidates: decisions.map((decision) => ({
        decisionId: decision.id,
        title: decision.title,
        projectTitle: decision.project.title,
        status: decision.status,
        updatedAt: decision.updatedAt.toISOString(),
      })),
    };
  }

  /**
   * 在统一授权范围之上叠加名称/主键匹配条件。
   * 当前 Decision 模型没有独立别名字段，因此按标题模糊匹配；
   * 查询词为纯数字时额外允许按主键精确匹配，覆盖“可见标识符”场景。
   */
  private buildQueryWhere(
    decisionWhere: Prisma.DecisionWhereInput,
    trimmedQuery: string,
  ): Prisma.DecisionWhereInput {
    const numericId = /^\d+$/.test(trimmedQuery)
      ? Number(trimmedQuery)
      : null;

    const matchConditions: Prisma.DecisionWhereInput[] = [
      { title: { contains: trimmedQuery, mode: 'insensitive' as const } },
    ];
    if (numericId !== null) {
      matchConditions.push({ id: numericId });
    }

    return {
      AND: [decisionWhere, { OR: matchConditions }],
    };
  }
}
