/**
 * 本文件负责新版工作台个人摘要与跨项目洞察的授权聚合查询。
 */
import { Injectable } from '@nestjs/common';
import type {
  DashboardDecisionStatusCount,
  DashboardInsightsResponse,
  DashboardProjectStatusCount,
  DashboardSummaryResponse,
} from '@workspace/contracts/dashboard';
import { PrismaService } from '../../database/prisma.service';
import {
  DecisionStatus,
  ProjectStatus,
  ProposalStatus,
  type Prisma,
} from '../../generated/prisma';
import { AuthorizationService } from '../auth/services/authorization.service';
import type { AuthorizationContext } from '../auth/types/auth.types';

/** 工作台最多展示的进行中决策数量。 */
const DECISION_STACK_SIZE = 4;
/** 中国标准时间相对 UTC 的固定偏移毫秒数。 */
const SHANGHAI_OFFSET_MILLISECONDS = 8 * 60 * 60 * 1000;

@Injectable()
export class DashboardQueryService {
  /** 注入数据库与统一决策可见范围服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** 查询当前用户参与数量与可见决策状态分布。 */
  async getSummary(
    authorization: AuthorizationContext,
  ): Promise<DashboardSummaryResponse> {
    const decisionWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const projectWhere = buildParticipatedProjectWhere(authorization.userId);
    const [projectCount, decisionCount, proposalCount, decisionGroups] =
      await Promise.all([
        this.prisma.project.count({ where: projectWhere }),
        this.prisma.decision.count({
          where: {
            AND: [
              decisionWhere,
              { participants: { some: { userId: authorization.userId } } },
            ],
          },
        }),
        this.prisma.decisionProposal.count({
          where: { creatorId: authorization.userId, decision: decisionWhere },
        }),
        this.prisma.decision.groupBy({
          by: ['status'],
          where: decisionWhere,
          _count: { _all: true },
        }),
      ]);

    return {
      decisionStatuses: buildDecisionStatusCounts(decisionGroups),
      participation: { projectCount, decisionCount, proposalCount },
    };
  }

  /** 查询工作台趋势、提案采纳、项目状态与最近推进中的决策。 */
  async getInsights(
    authorization: AuthorizationContext,
    now = new Date(),
  ): Promise<DashboardInsightsResponse> {
    const decisionWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const projectWhere = buildParticipatedProjectWhere(authorization.userId);
    const { year, month, from, to } = getShanghaiYearRange(now);
    const [resolvedDecisions, proposalGroups, projectGroups, activeDecisions] =
      await Promise.all([
        this.prisma.decision.findMany({
          where: { AND: [decisionWhere, { decidedAt: { gte: from, lt: to } }] },
          select: { decidedAt: true },
        }),
        this.prisma.decisionProposal.groupBy({
          by: ['status'],
          where: {
            decision: decisionWhere,
            status: { not: ProposalStatus.OPEN },
          },
          _count: { _all: true },
        }),
        this.prisma.project.groupBy({
          by: ['status'],
          where: projectWhere,
          _count: { _all: true },
        }),
        this.prisma.decision.findMany({
          where: {
            AND: [
              decisionWhere,
              {
                status: {
                  in: [DecisionStatus.DRAFT, DecisionStatus.DISCUSSING],
                },
              },
            ],
          },
          select: {
            id: true,
            title: true,
            status: true,
            project: { select: { title: true } },
            _count: { select: { participants: true, proposals: true } },
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: DECISION_STACK_SIZE,
        }),
      ]);

    return {
      year,
      throughMonth: month,
      resolutionTrend: buildResolutionTrend(resolvedDecisions, month),
      proposalAdoption: {
        acceptedCount: readGroupCount(proposalGroups, ProposalStatus.ACCEPTED),
        notAcceptedCount:
          readGroupCount(proposalGroups, ProposalStatus.REJECTED) +
          readGroupCount(proposalGroups, ProposalStatus.CANCELLED),
      },
      projectStatuses: buildProjectStatusCounts(projectGroups),
      decisionStack: activeDecisions.map((decision) => ({
        id: decision.id,
        title: decision.title,
        status: decision.status,
        projectTitle: decision.project.title,
        participantCount: decision._count.participants,
        proposalCount: decision._count.proposals,
      })),
    };
  }
}

/** 构造当前用户作为成员加入的项目查询范围。 */
function buildParticipatedProjectWhere(
  userId: number,
): Prisma.ProjectWhereInput {
  return { members: { some: { userId } } };
}

/** 将数据库决策状态聚合成工作台四个稳定展示组。 */
function buildDecisionStatusCounts(
  groups: Array<{ status: DecisionStatus; _count: { _all: number } }>,
): DashboardDecisionStatusCount[] {
  return [
    { status: 'DRAFT', count: readGroupCount(groups, DecisionStatus.DRAFT) },
    {
      status: 'DISCUSSING',
      count: readGroupCount(groups, DecisionStatus.DISCUSSING),
    },
    {
      status: 'RESOLVED',
      count: readGroupCount(groups, DecisionStatus.RESOLVED),
    },
    {
      status: 'CLOSED',
      count:
        readGroupCount(groups, DecisionStatus.CANCELLED) +
        readGroupCount(groups, DecisionStatus.ARCHIVED),
    },
  ];
}

/** 将数据库项目状态聚合补齐为固定三类。 */
function buildProjectStatusCounts(
  groups: Array<{ status: ProjectStatus; _count: { _all: number } }>,
): DashboardProjectStatusCount[] {
  return [
    { status: 'ACTIVE', count: readGroupCount(groups, ProjectStatus.ACTIVE) },
    { status: 'CLOSED', count: readGroupCount(groups, ProjectStatus.CLOSED) },
    {
      status: 'ARCHIVED',
      count: readGroupCount(groups, ProjectStatus.ARCHIVED),
    },
  ];
}

/** 从 Prisma 分组结果中读取指定状态数量，缺失状态按零处理。 */
function readGroupCount<TStatus>(
  groups: Array<{ status: TStatus; _count: { _all: number } }>,
  status: TStatus,
): number {
  return groups.find((group) => group.status === status)?._count._all ?? 0;
}

/** 把本年度已形成决策按中国标准时间月份归入从一月到当前月的趋势。 */
function buildResolutionTrend(
  decisions: Array<{ decidedAt: Date | null }>,
  throughMonth: number,
): DashboardInsightsResponse['resolutionTrend'] {
  const monthCounts = new Map<number, number>();
  decisions.forEach((decision) => {
    if (!decision.decidedAt) return;
    const month = getShanghaiMonth(decision.decidedAt);
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
  });
  return Array.from({ length: throughMonth }, (_, index) => ({
    month: index + 1,
    count: monthCounts.get(index + 1) ?? 0,
  }));
}

/** 计算中国标准时间当前年份及对应 UTC 查询边界。 */
function getShanghaiYearRange(now: Date): {
  year: number;
  month: number;
  from: Date;
  to: Date;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  return {
    year,
    month,
    from: new Date(Date.UTC(year, 0, 1) - SHANGHAI_OFFSET_MILLISECONDS),
    to: new Date(Date.UTC(year + 1, 0, 1) - SHANGHAI_OFFSET_MILLISECONDS),
  };
}

/** 读取任意时刻在中国标准时间中的公历月份。 */
function getShanghaiMonth(value: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      month: 'numeric',
    }).format(value),
  );
}
