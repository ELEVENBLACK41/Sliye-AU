/**
 * 本文件负责按主键读取一项决策的结构化上下文事实。
 * 权限范围与决策中心查询、决策发现共用同一套 `AuthorizationService.buildDecisionWhere`，
 * 未授权决策在 SQL 层就不会命中，因此调用方无法通过返回值区分“不存在”和“无权访问”。
 * 本服务只读取决策自身的结构化事实与关联计数，不读取讨论正文、会议转写或提案/投票明细。
 */

import { Injectable } from '@nestjs/common';
import type { SystemPermissionCode } from '@workspace/contracts/access';
import { PrismaService } from '../../../database/prisma.service';
import { ResolutionStatus } from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import type { DecisionContext } from '../types/decision-context.types';

/** 决策读取权限码，与决策中心和决策发现查询保持一致。 */
const DECISION_READ_PERMISSION: SystemPermissionCode = 'decision:read';

@Injectable()
export class DecisionContextService {
  /** 注入数据库和统一授权服务，复用与决策中心一致的数据范围判断。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /**
   * 在指定授权上下文的可访问范围内读取一项决策的结构化上下文。
   * 决策不存在或不在授权范围内时统一返回 null，调用方必须按同一种“未找到”对外表达，
   * 不得通过错误信息、耗时或字段差异泄漏无权决策的存在。
   */
  async getContext(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<DecisionContext | null> {
    this.authorizationService.assertPermission(
      authorization,
      DECISION_READ_PERMISSION,
    );
    const decisionWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      DECISION_READ_PERMISSION,
    );
    const decision = await this.prisma.decision.findFirst({
      where: { AND: [decisionWhere, { id: decisionId }] },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        areaId: true,
        decidedAt: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
        project: { select: { id: true, title: true } },
        area: { select: { name: true } },
        department: { select: { name: true } },
        owner: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        _count: {
          select: {
            participants: true,
            proposals: true,
            voteRounds: true,
            resolutions: true,
          },
        },
        resolutions: {
          where: { status: ResolutionStatus.ACTIVE },
          orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { id: true, title: true, kind: true, decidedAt: true },
        },
      },
    });
    if (!decision) {
      return null;
    }

    const latestResolution = decision.resolutions[0] ?? null;

    return {
      decisionId: decision.id,
      title: decision.title,
      description: decision.description,
      status: decision.status,
      projectId: decision.project.id,
      projectTitle: decision.project.title,
      scope: decision.areaId === null ? 'PROJECT' : 'AREA',
      areaName: decision.area?.name ?? null,
      departmentName: decision.department.name,
      ownerDisplayName: decision.owner
        ? this.toDisplayName(decision.owner)
        : null,
      creatorDisplayName: this.toDisplayName(decision.creator),
      participantCount: decision._count.participants,
      proposalCount: decision._count.proposals,
      voteRoundCount: decision._count.voteRounds,
      resolutionCount: decision._count.resolutions,
      latestActiveResolution: latestResolution
        ? {
            resolutionId: latestResolution.id,
            title: latestResolution.title,
            kind: latestResolution.kind,
            decidedAt: latestResolution.decidedAt,
          }
        : null,
      decidedAt: decision.decidedAt,
      archivedAt: decision.archivedAt,
      createdAt: decision.createdAt,
      updatedAt: decision.updatedAt,
    };
  }

  /** 生成参与人展示名；用户未设置昵称时退回稳定占位，避免把邮箱写入模型上下文。 */
  private toDisplayName(user: { id: number; name: string | null }): string {
    return user.name ?? `用户#${user.id}`;
  }
}
