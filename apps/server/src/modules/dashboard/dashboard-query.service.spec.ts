/**
 * 本文件验证工作台状态归并、个人统计和中国标准时间月度趋势口径。
 */
import {
  DecisionStatus,
  ProjectStatus,
  ProposalStatus,
} from '../../generated/prisma';
import { DashboardQueryService } from './dashboard-query.service';

/** 创建满足工作台查询服务依赖的最小测试上下文。 */
function createContext() {
  const prisma = {
    project: { count: jest.fn(), groupBy: jest.fn() },
    decision: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
    decisionProposal: { count: jest.fn(), groupBy: jest.fn() },
  };
  const authorizationService = {
    buildDecisionWhere: jest.fn().mockResolvedValue({ id: { gt: 0 } }),
  };
  const service = new DashboardQueryService(
    prisma as never,
    authorizationService as never,
  );
  return { service, prisma, authorization: { userId: 7 } as never };
}

describe('DashboardQueryService', () => {
  it('返回个人参与统计并把取消与归档决策合并为已结束', async () => {
    const { service, prisma, authorization } = createContext();
    prisma.project.count.mockResolvedValue(5);
    prisma.decision.count.mockResolvedValue(8);
    prisma.decisionProposal.count.mockResolvedValue(13);
    prisma.decision.groupBy.mockResolvedValue([
      { status: DecisionStatus.DRAFT, _count: { _all: 2 } },
      { status: DecisionStatus.DISCUSSING, _count: { _all: 3 } },
      { status: DecisionStatus.RESOLVED, _count: { _all: 4 } },
      { status: DecisionStatus.CANCELLED, _count: { _all: 1 } },
      { status: DecisionStatus.ARCHIVED, _count: { _all: 6 } },
    ]);

    const result = await service.getSummary(authorization);

    expect(result.participation).toEqual({
      projectCount: 5,
      decisionCount: 8,
      proposalCount: 13,
    });
    expect(result.decisionStatuses).toEqual([
      { status: 'DRAFT', count: 2 },
      { status: 'DISCUSSING', count: 3 },
      { status: 'RESOLVED', count: 4 },
      { status: 'CLOSED', count: 7 },
    ]);
  });

  it('按中国标准时间统计本年度月份并返回真实洞察', async () => {
    const { service, prisma, authorization } = createContext();
    prisma.decision.findMany
      .mockResolvedValueOnce([
        { decidedAt: new Date('2025-12-31T16:30:00.000Z') },
        { decidedAt: new Date('2026-02-12T03:00:00.000Z') },
      ])
      .mockResolvedValueOnce([
        {
          id: 11,
          title: '是否发布新版本',
          status: DecisionStatus.DISCUSSING,
          project: { title: '产品项目' },
          _count: { participants: 4, proposals: 2 },
        },
      ]);
    prisma.decisionProposal.groupBy.mockResolvedValue([
      { status: ProposalStatus.ACCEPTED, _count: { _all: 3 } },
      { status: ProposalStatus.REJECTED, _count: { _all: 2 } },
      { status: ProposalStatus.CANCELLED, _count: { _all: 1 } },
    ]);
    prisma.project.groupBy.mockResolvedValue([
      { status: ProjectStatus.ACTIVE, _count: { _all: 2 } },
      { status: ProjectStatus.ARCHIVED, _count: { _all: 1 } },
    ]);

    const result = await service.getInsights(
      authorization,
      new Date('2026-08-19T02:00:00.000Z'),
    );

    expect(result.year).toBe(2026);
    expect(result.throughMonth).toBe(8);
    expect(result.resolutionTrend[0]).toEqual({ month: 1, count: 1 });
    expect(result.resolutionTrend[1]).toEqual({ month: 2, count: 1 });
    expect(result.proposalAdoption).toEqual({
      acceptedCount: 3,
      notAcceptedCount: 3,
    });
    expect(result.projectStatuses).toEqual([
      { status: 'ACTIVE', count: 2 },
      { status: 'CLOSED', count: 0 },
      { status: 'ARCHIVED', count: 1 },
    ]);
    expect(result.decisionStack).toHaveLength(1);
  });
});
