/**
 * 本文件验证决策中心关键活动去重与过程指标计算，防止聚合口径发生静默漂移。
 */
import { DecisionEventType, DecisionStatus } from '../../../generated/prisma';
import { DecisionCenterQueryService } from './decision-center-query.service';

/** 创建满足查询服务依赖的最小测试上下文。 */
function createContext() {
  const prisma = {
    decisionEvent: { findMany: jest.fn() },
    decisionBallot: { findMany: jest.fn() },
    decisionResolution: { findMany: jest.fn() },
    decision: { count: jest.fn(), findMany: jest.fn() },
    decisionProposal: { findMany: jest.fn() },
    decisionVoteRound: { findMany: jest.fn() },
  };
  const authorizationService = {
    buildDecisionWhere: jest.fn().mockResolvedValue({ id: { gt: 0 } }),
  };
  const service = new DecisionCenterQueryService(
    prisma as never,
    authorizationService as never,
  );
  const authorization = { userId: 7 } as never;
  return { service, prisma, authorizationService, authorization };
}

describe('DecisionCenterQueryService', () => {
  it('按资源主键去重统计同一天的会议、提案、投票和决议', async () => {
    const { service, prisma, authorization } = createContext();
    const decision = {
      id: 11,
      title: '定价策略',
      project: { title: '商业化' },
    };
    prisma.decisionEvent.findMany.mockResolvedValueOnce([
      {
        id: 1,
        type: DecisionEventType.MEETING_STARTED,
        title: '开始会议',
        occurredAt: new Date('2026-08-10T03:00:00.000Z'),
        meetingId: 5,
        proposalId: null,
        voteRoundId: null,
        resolutionId: null,
        actor: null,
        decision,
      },
      {
        id: 2,
        type: DecisionEventType.MEETING_STARTED,
        title: '开始会议',
        occurredAt: new Date('2026-08-10T03:05:00.000Z'),
        meetingId: 5,
        proposalId: null,
        voteRoundId: null,
        resolutionId: null,
        actor: null,
        decision,
      },
    ]);
    prisma.decisionEvent.findMany.mockResolvedValueOnce([
      {
        id: 3,
        title: '创建提案',
        occurredAt: new Date('2026-08-10T04:00:00.000Z'),
        proposalId: 8,
        actor: null,
        decision,
      },
    ]);
    prisma.decisionBallot.findMany.mockResolvedValue([
      {
        id: 4,
        submittedAt: new Date('2026-08-10T05:00:00.000Z'),
        round: { id: 9, title: '方案表决', decision },
      },
    ]);
    prisma.decisionResolution.findMany.mockResolvedValue([
      {
        id: 5,
        title: '形成决议',
        decidedAt: new Date('2026-08-10T06:00:00.000Z'),
        decision,
      },
    ]);

    const result = await service.getActivityDay(authorization, '2026-08-10');

    expect(result.summary).toEqual({
      date: '2026-08-10',
      decisionCount: 1,
      eventCount: 4,
      meetingCount: 1,
      proposalCount: 1,
      voteCount: 1,
      resolutionCount: 1,
    });
    expect(result.events).toHaveLength(5);
  });

  it('用已结束样本计算过程比例并识别停滞决策', async () => {
    const { service, prisma, authorization } = createContext();
    prisma.decision.findMany.mockResolvedValue([
      {
        id: 1,
        title: '已收口决策',
        status: DecisionStatus.RESOLVED,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        decidedAt: new Date('2026-07-05T00:00:00.000Z'),
        updatedAt: new Date('2026-07-05T00:00:00.000Z'),
        project: { title: '项目甲' },
        events: [{ occurredAt: new Date('2026-07-02T00:00:00.000Z') }],
        _count: { proposals: 2, participants: 5, voteRounds: 1 },
      },
      {
        id: 2,
        title: '停滞决策',
        status: DecisionStatus.DISCUSSING,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        decidedAt: null,
        updatedAt: new Date('2025-01-03T00:00:00.000Z'),
        project: { title: '项目乙' },
        events: [{ occurredAt: new Date('2025-01-02T00:00:00.000Z') }],
        _count: { proposals: 1, participants: 3, voteRounds: 0 },
      },
    ]);
    prisma.decisionProposal.findMany.mockResolvedValue([
      { status: 'ACCEPTED' },
      { status: 'REJECTED' },
      { status: 'OPEN' },
    ]);
    prisma.decisionVoteRound.findMany.mockResolvedValue([
      { status: 'CLOSED' },
      { status: 'CANCELLED' },
    ]);

    const result = await service.getAnalytics(authorization);

    expect(result.metrics.averageCycleDays).toBe(4);
    expect(result.metrics.medianDiscussionDays).toBe(3);
    expect(result.metrics.proposalAdoptionRate).toBe(50);
    expect(result.metrics.voteClosureRate).toBe(50);
    expect(result.metrics.formalResolutionRate).toBe(50);
    expect(result.metrics.stalledDecisionCount).toBe(1);
  });

  it('在授权范围上叠加筛选条件并返回真实分页元数据', async () => {
    const { service, prisma, authorization } = createContext();
    prisma.decision.count.mockResolvedValue(23);
    prisma.decision.findMany.mockResolvedValue([
      {
        id: 12,
        title: '第二页决策',
        description: null,
        status: DecisionStatus.RESOLVED,
        areaId: null,
        area: null,
        project: { id: 3, title: '项目甲' },
        department: { name: '产品部' },
        decidedAt: new Date('2026-08-01T00:00:00.000Z'),
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        _count: {
          participants: 4,
          proposals: 2,
          voteRounds: 1,
          resolutions: 1,
          meetingLinks: 1,
        },
      },
    ]);

    const result = await service.getArchive(authorization, {
      keyword: '第二页',
      scope: 'PROJECT',
      status: 'RESOLVED',
      page: 2,
      pageSize: 10,
    });

    expect(prisma.decision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        total: 23,
        page: 2,
        pageSize: 10,
        totalPages: 3,
      }),
    );
    expect(result.items).toHaveLength(1);
  });
});
