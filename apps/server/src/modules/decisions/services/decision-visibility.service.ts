/**
 * 本文件负责批量判断一组决策与决议对当前用户是否仍然可见。
 *
 * AI 历史的来源失权投影需要回答“这条回答依赖的来源现在还看得到吗”。
 * 判断必须复用与决策列表、详情完全相同的数据范围条件，
 * 否则历史投影会和真实权限规则漂移，出现“详情看不到但历史仍显示”的不一致。
 *
 * 这里只做批量存在性判断，不返回任何决策内容：调用方只需要知道可见与否。
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';

@Injectable()
export class DecisionVisibilityService {
  /** 注入 Prisma 与授权服务；数据范围一律由授权服务生成。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** 从给定决策主键中筛出当前用户仍可读取的部分。 */
  async filterVisibleDecisionIds(
    authorization: AuthorizationContext,
    decisionIds: readonly number[],
  ): Promise<Set<number>> {
    if (decisionIds.length === 0) {
      return new Set();
    }

    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const visible = await this.prisma.decision.findMany({
      // 主键条件叠加在授权范围之上，不替换也不放宽它。
      where: { AND: [scopeWhere, { id: { in: [...decisionIds] } }] },
      select: { id: true },
    });

    return new Set(visible.map((decision) => decision.id));
  }

  /**
   * 从给定决议主键中筛出当前用户仍可读取的部分。
   * 决议本身没有独立数据范围，可见性等同于其所属决策。
   */
  async filterVisibleResolutionIds(
    authorization: AuthorizationContext,
    resolutionIds: readonly number[],
  ): Promise<Set<number>> {
    if (resolutionIds.length === 0) {
      return new Set();
    }

    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const visible = await this.prisma.decisionResolution.findMany({
      where: {
        id: { in: [...resolutionIds] },
        decision: { is: { AND: [scopeWhere] } },
      },
      select: { id: true },
    });

    return new Set(visible.map((resolution) => resolution.id));
  }
}
