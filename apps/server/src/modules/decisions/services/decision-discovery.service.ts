/**
 * 本文件负责按名称或主键在当前用户可访问范围内发现候选 Decision。
 * 权限范围与决策中心查询共用同一套 `AuthorizationService.buildDecisionWhere`，
 * 避免多处重复实现或悄悄产生不一致的数据范围判断。
 * 本服务只做“发现候选”，不读取决策详情、讨论、提案、投票或会议内容。
 */

import { Injectable } from '@nestjs/common';
import type { SystemPermissionCode } from '@workspace/contracts/access';
import { PrismaService } from '../../../database/prisma.service';
import type { Prisma } from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import type { DecisionDiscoveryCandidate } from '../types/decision-discovery.types';

/** 决策读取权限码，与决策中心现有查询保持一致。 */
const DECISION_READ_PERMISSION: SystemPermissionCode = 'decision:read';

/** 无论调用方传入多大的 limit，都不允许单次查询超过该条数。 */
const ABSOLUTE_MAX_DISCOVERY_LIMIT = 20;

@Injectable()
export class DecisionDiscoveryService {
  /** 注入数据库和统一授权服务，复用与决策中心一致的数据范围判断。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /**
   * 在指定授权上下文的可访问范围内查找候选 Decision。
   * 调用方需保证 `trimmedQuery` 已裁剪且非空；权限过滤在 SQL 层完成，
   * 未授权记录不会进入结果集，因此候选数量、顺序和空结果都不会泄漏无权 Decision 的存在。
   */
  async findCandidates(
    authorization: AuthorizationContext,
    trimmedQuery: string,
    limit: number,
  ): Promise<DecisionDiscoveryCandidate[]> {
    this.authorizationService.assertPermission(
      authorization,
      DECISION_READ_PERMISSION,
    );
    const boundedLimit = Math.min(
      Math.max(1, Math.trunc(limit)),
      ABSOLUTE_MAX_DISCOVERY_LIMIT,
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
        areaId: true,
        status: true,
        updatedAt: true,
        project: { select: { title: true } },
        area: { select: { name: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: boundedLimit,
    });

    return decisions.map((decision) => ({
      decisionId: decision.id,
      title: decision.title,
      projectTitle: decision.project.title,
      scope: decision.areaId === null ? 'PROJECT' : 'AREA',
      areaName: decision.area?.name ?? null,
      status: decision.status,
      updatedAt: decision.updatedAt,
    }));
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
    const numericId = /^\d+$/.test(trimmedQuery) ? Number(trimmedQuery) : null;

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
