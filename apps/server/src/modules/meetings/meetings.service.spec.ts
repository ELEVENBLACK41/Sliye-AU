/**
 * 本文件验证项目分区会议的创建、可见性、参会人边界和多决策时间线。
 */
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { PrismaService } from '../../database/prisma.service';
import {
  DiscussionAreaMemberRole,
  DiscussionAreaStatus,
  DiscussionAreaType,
  ProjectMemberRole,
  ProjectStatus,
  MeetingParticipantRole,
  MeetingStatus,
} from '../../generated/prisma';
import type { AuthorizationContext } from '../auth/types/auth.types';
import type {
  DiscussionAreaAccessContext,
  ProjectAccessService,
} from '../projects/services/project-access.service';
import type { MeetingDetailRecord } from './meetings.mapper';
import { MeetingsService } from './meetings.service';
import { MeetingLifecycleService } from './services/meeting-lifecycle.service';
import type { MeetingLiveKitService } from './services/meeting-livekit.service';
import type { NotificationService } from '../notifications/services/notification.service';

/** 创建会议测试使用的请求级授权上下文。 */
function createAuthorization(userId = 7): AuthorizationContext {
  return {
    userId,
    deptId: 3,
    isSuperAdmin: false,
    roleCodes: new Set(['MEMBER']),
    deniedPermissions: new Set(),
    grants: new Map(),
  };
}

/** 创建可由会议 Mapper 消费的完整数据库记录。 */
function createMeetingRecord(
  overrides: Partial<MeetingDetailRecord> = {},
): MeetingDetailRecord {
  const createdAt = new Date('2026-07-24T02:00:00.000Z');

  return {
    id: 30,
    areaId: 40,
    createdById: 7,
    title: '权限模块重构方案评审会',
    description: '讨论候选方案并决定是否进入投票。',
    status: MeetingStatus.SCHEDULED,
    roomKey: 'meeting-room-key',
    provider: null,
    providerRoomId: null,
    scheduledAt: new Date('2026-07-25T06:00:00.000Z'),
    startedAt: null,
    endedAt: null,
    createdAt,
    updatedAt: createdAt,
    createdBy: { id: 7, name: '负责人', avatarUrl: null },
    area: {
      id: 40,
      projectId: 10,
      name: '公共讨论',
      type: DiscussionAreaType.PUBLIC,
    },
    decisionLinks: [
      {
        meetingId: 30,
        decisionId: 20,
        createdAt,
        decision: {
          id: 20,
          title: '是否重构权限模块',
          status: 'DISCUSSING',
        },
      },
      {
        meetingId: 30,
        decisionId: 21,
        createdAt,
        decision: {
          id: 21,
          title: '是否迁移审计日志',
          status: 'DRAFT',
        },
      },
    ],
    _count: { participants: 2 },
    participants: [
      {
        id: 1,
        meetingId: 30,
        userId: 7,
        role: MeetingParticipantRole.HOST,
        joinedAt: null,
        leftAt: null,
        createdAt,
        user: { id: 7, name: '负责人', avatarUrl: null },
      },
      {
        id: 2,
        meetingId: 30,
        userId: 8,
        role: MeetingParticipantRole.ATTENDEE,
        joinedAt: null,
        leftAt: null,
        createdAt,
        user: { id: 8, name: '参与者', avatarUrl: null },
      },
    ],
    ...overrides,
  };
}

/** 创建公共分区的授权上下文。 */
function createAreaContext(
  type: DiscussionAreaType = DiscussionAreaType.PUBLIC,
): DiscussionAreaAccessContext {
  return {
    id: 40,
    projectId: 10,
    type,
    status: DiscussionAreaStatus.ACTIVE,
    projectStatus: ProjectStatus.ACTIVE,
    projectMemberRole: ProjectMemberRole.OWNER,
    areaMemberRole:
      type === DiscussionAreaType.PRIVATE
        ? DiscussionAreaMemberRole.MANAGER
        : null,
  };
}

/** 创建会议服务与生命周期服务的共享测试替身。 */
function createHarness(type: DiscussionAreaType = DiscussionAreaType.PUBLIC) {
  const transaction = {
    meetingParticipant: {
      count: jest.fn().mockResolvedValueOnce(1).mockResolvedValue(0),
    },
    meetingSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
    },
    decisionEvent: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
  };
  const prisma = {
    decision: { count: jest.fn().mockResolvedValue(2) },
    projectMember: { count: jest.fn().mockResolvedValue(2) },
    discussionAreaMember: { count: jest.fn().mockResolvedValue(2) },
    meetingSession: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  const areaContext = createAreaContext(type);
  const projectAccessService = {
    findProject: jest.fn().mockResolvedValue({
      id: 10,
      status: ProjectStatus.ACTIVE,
      memberRole: ProjectMemberRole.OWNER,
    }),
    findArea: jest.fn().mockResolvedValue(areaContext),
    buildVisibleAreaWhere: jest.fn((userId: number, projectId?: number) => ({
      ...(projectId === undefined ? {} : { projectId }),
      visibleToUserId: userId,
    })),
    assertAreaMeetingManager: jest.fn(),
    assertAreaWritable: jest.fn(),
  };
  const liveKitService = { closeRoom: jest.fn().mockResolvedValue(undefined) };
  const notificationService = {
    notifyMeetingInvited: jest.fn(),
    notifyMeetingEnded: jest.fn(),
  };

  return {
    prisma,
    transaction,
    projectAccessService,
    service: new MeetingsService(
      prisma as unknown as PrismaService,
      projectAccessService as unknown as ProjectAccessService,
      notificationService as unknown as NotificationService,
      liveKitService,
    ),
    lifecycleService: new MeetingLifecycleService(
      prisma as unknown as PrismaService,
      projectAccessService as unknown as ProjectAccessService,
      liveKitService as unknown as MeetingLiveKitService,
      notificationService as unknown as NotificationService,
    ),
    liveKitService,
    notificationService,
  };
}

describe('MeetingsService', () => {
  it('公共分区应能创建关联多项决策的会议', async () => {
    const { service, prisma, projectAccessService, notificationService } =
      createHarness();
    prisma.meetingSession.create.mockResolvedValue(createMeetingRecord());

    await expect(
      service.create(createAuthorization(), 10, {
        areaId: 40,
        title: '权限模块重构方案评审会',
        description: '讨论候选方案并决定是否进入投票。',
        scheduledAt: '2026-07-25T06:00:00.000Z',
        decisionIds: [20, 21],
        participantIds: [8],
      }),
    ).resolves.toMatchObject({
      id: 30,
      projectId: 10,
      areaId: 40,
      participantCount: 2,
      decisions: [{ id: 20 }, { id: 21 }],
    });
    expect(projectAccessService.assertAreaMeetingManager).toHaveBeenCalled();
    expect(notificationService.notifyMeetingInvited).toHaveBeenCalledWith({
      recipientIds: [8],
      meetingId: 30,
      meetingTitle: '权限模块重构方案评审会',
      actor: { id: 7, name: '负责人' },
      occurredAt: createMeetingRecord().createdAt,
    });
    expect(prisma.decision.count).toHaveBeenCalledWith({
      where: {
        id: { in: [20, 21] },
        projectId: 10,
        OR: [{ areaId: null }, { areaId: 40 }],
      },
    });
    expect(prisma.meetingSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // Jest 非对称匹配器在类型层会退化为 any，仅用于断言调用载荷。
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          areaId: 40,
          participants: {
            createMany: {
              data: [
                { userId: 7, role: MeetingParticipantRole.HOST },
                { userId: 8, role: MeetingParticipantRole.ATTENDEE },
              ],
            },
          },
          decisionLinks: {
            createMany: {
              data: [{ decisionId: 20 }, { decisionId: 21 }],
            },
          },
        }),
      }),
    );
  });

  it('私有分区会议不得邀请分区外成员', async () => {
    const { service, prisma } = createHarness(DiscussionAreaType.PRIVATE);
    prisma.decision.count.mockResolvedValue(0);
    prisma.discussionAreaMember.count.mockResolvedValue(1);

    await expect(
      service.create(createAuthorization(), 10, {
        areaId: 40,
        title: '私有评审会',
        decisionIds: [],
        participantIds: [8],
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.MEETING_PARTICIPANT_INVALID,
      status: 400,
    });
    expect(prisma.meetingSession.create).not.toHaveBeenCalled();
  });

  it('会议列表应复用当前用户可见分区条件', async () => {
    const { service, prisma, projectAccessService } = createHarness();
    prisma.meetingSession.findMany.mockResolvedValue([]);

    await expect(service.list(createAuthorization(), 10)).resolves.toEqual([]);
    expect(projectAccessService.buildVisibleAreaWhere).toHaveBeenCalledWith(
      7,
      10,
    );
    expect(prisma.meetingSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { area: { projectId: 10, visibleToUserId: 7 } },
      }),
    );
  });

  it('开始多决策会议时应为每项决策写入独立事件', async () => {
    const { lifecycleService, prisma, transaction } = createHarness();
    const scheduled = createMeetingRecord();
    const live = createMeetingRecord({
      status: MeetingStatus.LIVE,
      startedAt: new Date('2026-07-24T02:30:00.000Z'),
    });
    prisma.meetingSession.findFirst.mockResolvedValue(scheduled);
    transaction.meetingSession.findUnique.mockResolvedValue(live);

    await expect(
      lifecycleService.start(createAuthorization(), 30),
    ).resolves.toMatchObject({ id: 30, status: MeetingStatus.LIVE });
    expect(transaction.decisionEvent.createMany).toHaveBeenCalledWith({
      // Jest 非对称匹配器在类型层会退化为 any，仅用于断言事件集合。
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.arrayContaining([
        expect.objectContaining({ decisionId: 20, meetingId: 30 }),
        expect.objectContaining({ decisionId: 21, meetingId: 30 }),
      ]),
    });
  });

  it('普通项目会议不应写入决策时间线', async () => {
    const { lifecycleService, prisma, transaction } = createHarness();
    const scheduled = createMeetingRecord({ decisionLinks: [] });
    const live = createMeetingRecord({
      decisionLinks: [],
      status: MeetingStatus.LIVE,
      startedAt: new Date('2026-07-24T02:30:00.000Z'),
    });
    prisma.meetingSession.findFirst.mockResolvedValue(scheduled);
    transaction.meetingSession.findUnique.mockResolvedValue(live);

    await lifecycleService.start(createAuthorization(), 30);

    expect(transaction.decisionEvent.createMany).not.toHaveBeenCalled();
  });

  it('最后一位已进入的参会人退出后应自动结束会议', async () => {
    const { lifecycleService, transaction, notificationService } =
      createHarness();
    const live = createMeetingRecord({ status: MeetingStatus.LIVE });
    transaction.meetingSession.findUnique.mockResolvedValue(live);
    const endedAt = new Date('2026-07-24T03:00:00.000Z');

    await expect(lifecycleService.endIfEmpty(30, endedAt)).resolves.toBe(true);

    expect(transaction.meetingSession.updateMany).toHaveBeenCalledWith({
      where: { id: 30, status: MeetingStatus.LIVE },
      data: { status: MeetingStatus.ENDED, endedAt },
    });
    expect(notificationService.notifyMeetingEnded).toHaveBeenCalledWith({
      recipientIds: [7, 8],
      meetingId: 30,
      meetingTitle: '权限模块重构方案评审会',
      occurredAt: endedAt,
    });
  });

  it('尚无人进入的空房间不应自动结束业务会议', async () => {
    const { lifecycleService, transaction } = createHarness();
    transaction.meetingParticipant.count.mockReset().mockResolvedValue(0);

    await expect(
      lifecycleService.endIfEmpty(30, new Date('2026-07-24T03:00:00.000Z')),
    ).resolves.toBe(false);

    expect(transaction.meetingSession.updateMany).not.toHaveBeenCalled();
  });

  it('主持人结束会议时应关闭房间并通知其他参会人', async () => {
    const {
      lifecycleService,
      prisma,
      transaction,
      liveKitService,
      notificationService,
    } = createHarness();
    const live = createMeetingRecord({ status: MeetingStatus.LIVE });
    const ended = createMeetingRecord({ status: MeetingStatus.ENDED });
    prisma.meetingSession.findFirst.mockResolvedValue(live);
    transaction.meetingSession.findUnique.mockResolvedValue(ended);

    await lifecycleService.end(createAuthorization(), 30);

    expect(liveKitService.closeRoom).toHaveBeenCalledWith(30);
    expect(notificationService.notifyMeetingEnded).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientIds: [8],
        meetingId: 30,
        meetingTitle: '权限模块重构方案评审会',
        actor: { id: 7, name: '负责人' },
      }),
    );
  });
});
