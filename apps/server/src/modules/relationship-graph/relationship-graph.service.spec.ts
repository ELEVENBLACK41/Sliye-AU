/**
 * 本文件验证个人关系图谱的权限裁剪、稳定映射、聚合边和隐私边界。
 */
import { DiscussionAreaType } from '../../generated/prisma';
import { RelationshipGraphService } from './relationship-graph.service';

/** 创建满足图谱服务依赖的最小数据库与授权测试上下文。 */
function createContext() {
  const prisma = {
    project: { findMany: jest.fn() },
    discussionArea: { findMany: jest.fn() },
    decision: { findMany: jest.fn() },
    meetingSession: { findMany: jest.fn() },
  };
  const authorizationService = {
    buildDecisionWhere: jest
      .fn()
      .mockResolvedValue({ AND: [{ projectId: { gt: 0 } }] }),
  };
  const service = new RelationshipGraphService(
    prisma as never,
    authorizationService as never,
  );
  const authorization = { userId: 7 } as never;

  return { service, prisma, authorizationService, authorization };
}

/** 创建只含图谱安全展示字段的用户记录。 */
function graphUser(id: number, name = `用户 ${id}`) {
  return {
    id,
    name,
    avatarUrl: null,
    createdAt: new Date(`2026-01-${String(id).padStart(2, '0')}T00:00:00.000Z`),
  };
}

describe('RelationshipGraphService', () => {
  it('使用项目成员、分区可见性、决策授权和独立会议参与关系裁剪查询', async () => {
    const { service, prisma, authorizationService, authorization } =
      createContext();
    prisma.project.findMany.mockResolvedValue([]);
    prisma.discussionArea.findMany.mockResolvedValue([]);
    prisma.decision.findMany.mockResolvedValue([]);
    prisma.meetingSession.findMany.mockResolvedValue([]);

    const result = await service.getGraph(authorization);

    expect(authorizationService.buildDecisionWhere).toHaveBeenCalledWith(
      authorization,
      'decision:read',
    );
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { members: { some: { userId: 7 } } },
      }),
    );
    expect(prisma.discussionArea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          project: { members: { some: { userId: 7 } } },
          OR: [
            { type: DiscussionAreaType.PUBLIC },
            { members: { some: { userId: 7 } } },
          ],
        },
      }),
    );
    expect(prisma.decision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ projectId: { gt: 0 } }] },
      }),
    );
    expect(prisma.meetingSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            {
              area: {
                project: { members: { some: { userId: 7 } } },
                OR: [
                  { type: DiscussionAreaType.PUBLIC },
                  { members: { some: { userId: 7 } } },
                ],
              },
            },
            { areaId: null, participants: { some: { userId: 7 } } },
          ],
        },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        nodes: [],
        edges: [],
        currentUserId: 7,
        counts: {
          PROJECT: 0,
          AREA: 0,
          DECISION: 0,
          MEETING: 0,
          PROPOSAL: 0,
          VOTE_ROUND: 0,
          RESOLUTION: 0,
          USER: 0,
        },
      }),
    );
    expect(Number.isFinite(Date.parse(result.generatedAt))).toBe(true);
  });

  it('映射完整业务过程并合并同一有向节点对的多种人员关系', async () => {
    const { service, prisma, authorization } = createContext();
    const currentUser = graphUser(7, '当前用户');
    prisma.project.findMany.mockResolvedValue([
      {
        id: 10,
        title: '产品项目',
        description: '项目说明',
        status: 'ACTIVE',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        createdById: 7,
        ownerId: 7,
        createdBy: currentUser,
        owner: currentUser,
        members: [{ role: 'OWNER', user: currentUser }],
      },
    ]);
    prisma.discussionArea.findMany.mockResolvedValue([
      {
        id: 20,
        projectId: 10,
        name: '公开讨论区',
        description: null,
        type: 'PUBLIC',
        status: 'ACTIVE',
        createdAt: new Date('2026-02-02T00:00:00.000Z'),
        createdById: 7,
        createdBy: currentUser,
        members: [],
      },
    ]);
    prisma.decision.findMany.mockResolvedValue([
      {
        id: 30,
        projectId: 10,
        areaId: 20,
        title: '采用新方案',
        description: '决策说明',
        status: 'RESOLVED',
        createdAt: new Date('2026-02-03T00:00:00.000Z'),
        creatorId: 7,
        ownerId: 7,
        creator: currentUser,
        owner: currentUser,
        participants: [{ role: 'OWNER', user: currentUser }],
        proposals: [
          {
            id: 40,
            decisionId: 30,
            creatorId: 7,
            title: '候选方案',
            description: null,
            status: 'ACCEPTED',
            createdAt: new Date('2026-02-04T00:00:00.000Z'),
            creator: currentUser,
          },
        ],
        voteRounds: [
          {
            id: 50,
            decisionId: 30,
            creatorId: 7,
            title: '第一轮投票',
            description: null,
            status: 'CLOSED',
            isAnonymous: true,
            openedAt: new Date('2026-02-05T00:00:00.000Z'),
            createdAt: new Date('2026-02-05T00:00:00.000Z'),
            creator: currentUser,
            options: [{ proposalId: 40 }],
          },
        ],
        resolutions: [
          {
            id: 60,
            decisionId: 30,
            sourceProposalId: null,
            sourceVoteRoundId: null,
            decidedById: 7,
            supersedesId: null,
            title: '旧决议',
            content: '旧结论',
            status: 'SUPERSEDED',
            decidedAt: new Date('2026-02-06T00:00:00.000Z'),
            decidedBy: currentUser,
          },
          {
            id: 61,
            decisionId: 30,
            sourceProposalId: 40,
            sourceVoteRoundId: 50,
            decidedById: 7,
            supersedesId: 60,
            title: '正式决议',
            content: '最终结论',
            status: 'ACTIVE',
            decidedAt: new Date('2026-02-07T00:00:00.000Z'),
            decidedBy: currentUser,
          },
        ],
      },
    ]);
    prisma.meetingSession.findMany.mockResolvedValue([
      {
        id: 70,
        areaId: 20,
        title: '方案评审会',
        description: null,
        status: 'ENDED',
        scheduledAt: new Date('2026-02-04T02:00:00.000Z'),
        startedAt: new Date('2026-02-04T02:05:00.000Z'),
        createdAt: new Date('2026-02-04T00:00:00.000Z'),
        createdById: 7,
        area: { projectId: 10 },
        createdBy: currentUser,
        participants: [
          {
            role: 'HOST',
            invitationStatus: 'ACCEPTED',
            joinedAt: new Date('2026-02-04T02:05:00.000Z'),
            user: currentUser,
          },
        ],
        decisionLinks: [{ decisionId: 30 }],
      },
    ]);

    const result = await service.getGraph(authorization);

    expect(result.nodes).toHaveLength(9);
    expect(result.counts).toEqual({
      PROJECT: 1,
      AREA: 1,
      DECISION: 1,
      MEETING: 1,
      PROPOSAL: 1,
      VOTE_ROUND: 1,
      RESOLUTION: 2,
      USER: 1,
    });
    expect(result.nodes.find((node) => node.id === 'user:7')).toEqual(
      expect.objectContaining({
        title: '当前用户',
        avatarUrl: null,
        isCurrentUser: true,
        timestamp: '2026-02-01T00:00:00.000Z',
      }),
    );
    expect(
      result.edges.find((edge) => edge.id === 'edge:user:7->project:10'),
    ).toEqual({
      id: 'edge:user:7->project:10',
      source: 'user:7',
      target: 'project:10',
      relations: ['MEMBER', 'CREATED', 'OWNS'],
      label: '成员、创建、负责',
      weight: 3,
      directed: true,
    });
    expect(
      result.edges.find((edge) => edge.id === 'edge:user:7->decision:30'),
    ).toEqual(
      expect.objectContaining({
        relations: ['CREATED', 'OWNS', 'PARTICIPATES'],
        weight: 3,
      }),
    );
    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'proposal:40',
          target: 'vote_round:50',
          relations: ['CANDIDATE'],
        }),
        expect.objectContaining({
          source: 'proposal:40',
          target: 'resolution:61',
          relations: ['BASIS'],
        }),
        expect.objectContaining({
          source: 'vote_round:50',
          target: 'resolution:61',
          relations: ['BASIS'],
        }),
        expect.objectContaining({
          source: 'resolution:60',
          target: 'resolution:61',
          relations: ['SUPERSEDED_BY'],
        }),
        expect.objectContaining({
          source: 'meeting:70',
          target: 'decision:30',
          relations: ['DISCUSSES'],
        }),
      ]),
    );
  });

  it('匿名投票只加载轮次和提案引用，不读取或生成选票、选择与投票人关系', async () => {
    const { service, prisma, authorization } = createContext();
    const creator = graphUser(8, '创建人');
    prisma.project.findMany.mockResolvedValue([]);
    prisma.discussionArea.findMany.mockResolvedValue([]);
    prisma.meetingSession.findMany.mockResolvedValue([]);
    prisma.decision.findMany.mockResolvedValue([
      {
        id: 30,
        projectId: 10,
        areaId: null,
        title: '匿名表决',
        description: null,
        status: 'DISCUSSING',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        creatorId: 8,
        ownerId: null,
        creator,
        owner: null,
        participants: [],
        proposals: [],
        voteRounds: [
          {
            id: 50,
            decisionId: 30,
            creatorId: 8,
            title: '匿名投票',
            description: null,
            status: 'OPEN',
            isAnonymous: true,
            openedAt: new Date('2026-03-02T00:00:00.000Z'),
            createdAt: new Date('2026-03-02T00:00:00.000Z'),
            creator,
            options: [{ proposalId: null }],
          },
        ],
        resolutions: [],
      },
    ]);

    const result = await service.getGraph(authorization);
    const decisionCalls = prisma.decision.findMany.mock.calls as unknown as [
      {
        select: Record<string, unknown> & {
          voteRounds: { select: Record<string, unknown> };
        };
      }[],
    ];
    const decisionSelect = decisionCalls[0][0].select;
    const voteRoundSelect = decisionSelect.voteRounds.select;

    expect(voteRoundSelect).not.toHaveProperty('ballots');
    expect(voteRoundSelect.options).toEqual({
      select: { proposalId: true },
      orderBy: { id: 'asc' },
    });
    expect(decisionSelect).not.toHaveProperty('tasks');
    expect(result.nodes.some((node) => node.id === 'user:7')).toBe(false);
    expect(result.edges.some((edge) => edge.relations.includes('MEMBER'))).toBe(
      false,
    );
    expect(result.edges.some((edge) => edge.source.startsWith('ballot:'))).toBe(
      false,
    );
  });

  it('不会把待响应、拒绝或错过的会议邀请误报为参与关系', async () => {
    const { service, prisma, authorization } = createContext();
    const creator = graphUser(8, '会议创建人');
    const invited = graphUser(7, '待响应用户');
    const declined = graphUser(9, '已拒绝用户');
    const joined = graphUser(10, '实际参会用户');
    const accepted = graphUser(11, '已接受用户');
    prisma.project.findMany.mockResolvedValue([]);
    prisma.discussionArea.findMany.mockResolvedValue([]);
    prisma.decision.findMany.mockResolvedValue([]);
    prisma.meetingSession.findMany.mockResolvedValue([
      {
        id: 70,
        areaId: null,
        title: '独立评审会',
        description: null,
        status: 'SCHEDULED',
        scheduledAt: new Date('2026-04-01T02:00:00.000Z'),
        startedAt: null,
        createdAt: new Date('2026-03-28T00:00:00.000Z'),
        createdById: 8,
        area: null,
        createdBy: creator,
        participants: [
          {
            role: 'ATTENDEE',
            invitationStatus: 'INVITED',
            joinedAt: null,
            user: invited,
          },
          {
            role: 'ATTENDEE',
            invitationStatus: 'DECLINED',
            joinedAt: null,
            user: declined,
          },
          {
            role: 'ATTENDEE',
            invitationStatus: 'MISSED',
            joinedAt: new Date('2026-04-01T02:05:00.000Z'),
            user: joined,
          },
          {
            role: 'ATTENDEE',
            invitationStatus: 'ACCEPTED',
            joinedAt: null,
            user: accepted,
          },
        ],
        decisionLinks: [],
      },
    ]);

    const result = await service.getGraph(authorization);

    expect(result.nodes.find((node) => node.id === 'meeting:70')).toEqual(
      expect.objectContaining({ currentUserRole: 'INVITED' }),
    );
    expect(result.nodes.some((node) => node.id === 'user:7')).toBe(false);
    expect(result.nodes.some((node) => node.id === 'user:9')).toBe(false);
    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'user:10',
          target: 'meeting:70',
          relations: ['PARTICIPATES'],
        }),
        expect.objectContaining({
          source: 'user:11',
          target: 'meeting:70',
          relations: ['PARTICIPATES'],
        }),
      ]),
    );
    expect(
      result.edges.some(
        (edge) => edge.source === 'user:7' || edge.source === 'user:9',
      ),
    ).toBe(false);
  });
});
