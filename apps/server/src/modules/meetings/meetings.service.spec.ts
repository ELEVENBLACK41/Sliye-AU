/**
 * 本文件验证无音视频会议的创建、授权和生命周期流转边界。
 */
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { PrismaService } from '../../database/prisma.service';
import {
  DataScope,
  DecisionStatus,
  MeetingMode,
  MeetingParticipantRole,
  MeetingStatus,
  ParticipantRole,
} from '../../generated/prisma';
import type { AuthorizationService } from '../auth/services/authorization.service';
import type { AuthorizationContext } from '../auth/types/auth.types';
import type { MeetingDetailRecord } from './meetings.mapper';
import { MeetingsService } from './meetings.service';
import { MeetingLifecycleService } from './services/meeting-lifecycle.service';

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

/** 创建可由 Mapper 消费的完整会议查询结果。 */
function createMeetingRecord(
  overrides: Partial<MeetingDetailRecord> = {},
): MeetingDetailRecord {
  const createdAt = new Date('2026-07-24T02:00:00.000Z');

  return {
    id: 30,
    spaceId: 40,
    createdById: 7,
    title: '权限模块重构方案评审会',
    description: '讨论候选方案并决定是否进入投票。',
    mode: MeetingMode.VIDEO,
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
    space: {
      decision: {
        id: 20,
        ownerId: 7,
        status: DecisionStatus.DISCUSSING,
      },
    },
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

/** 从 Jest Mock 中安全读取第一次调用的第一个参数。 */
function getFirstCallArgument(mockFunction: {
  /** Jest 记录的调用信息。 */
  mock: { calls: unknown[][] };
}): unknown {
  return mockFunction.mock.calls[0]?.[0];
}

/** 创建会议服务使用的最小 Prisma 与授权服务 Mock。 */
function createServiceHarness(options?: { allScope?: boolean }) {
  const transaction = {
    decision: {
      update: jest.fn(),
    },
    meetingSession: {
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
    },
    decisionEvent: {
      create: jest.fn(),
    },
  };
  const prisma = {
    decision: {
      findFirst: jest.fn(),
    },
    meetingSession: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  const authorizationService = {
    buildDecisionWhere: jest.fn().mockResolvedValue({ deptId: 3 }),
    getScopes: jest
      .fn()
      .mockReturnValue(
        options?.allScope
          ? new Set([DataScope.ALL])
          : new Set([DataScope.PARTICIPATED]),
      ),
  };

  return {
    service: new MeetingsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    ),
    lifecycleService: new MeetingLifecycleService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    ),
    prisma,
    transaction,
    authorizationService,
  };
}

describe('MeetingsService', () => {
  it('负责人创建会议时应同步决策参与者并把负责人设为主持人', async () => {
    const { service, prisma } = createServiceHarness();
    const meeting = createMeetingRecord();
    prisma.decision.findFirst.mockResolvedValue({
      id: 20,
      ownerId: 7,
      spaceId: 40,
      status: DecisionStatus.DRAFT,
      participants: [
        { userId: 7, role: ParticipantRole.OWNER },
        { userId: 8, role: ParticipantRole.APPROVER },
      ],
    });
    prisma.meetingSession.create.mockResolvedValue(meeting);

    await expect(
      service.create(createAuthorization(), 20, {
        title: '权限模块重构方案评审会',
        description: '讨论候选方案并决定是否进入投票。',
        mode: MeetingMode.VIDEO,
        scheduledAt: '2026-07-25T06:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      id: 30,
      decisionId: 20,
      status: MeetingStatus.SCHEDULED,
      participantCount: 2,
    });
    const createArgument = getFirstCallArgument(prisma.meetingSession.create);
    expect(createArgument).toMatchObject({
      data: {
        spaceId: 40,
        participants: {
          createMany: {
            data: [
              { userId: 7, role: MeetingParticipantRole.HOST },
              { userId: 8, role: MeetingParticipantRole.ATTENDEE },
            ],
          },
        },
      },
    });
  });

  it('非负责人且没有 ALL 范围时不能创建会议', async () => {
    const { service, prisma } = createServiceHarness();
    prisma.decision.findFirst.mockResolvedValue({
      id: 20,
      ownerId: 9,
      spaceId: 40,
      status: DecisionStatus.DISCUSSING,
      participants: [{ userId: 7, role: ParticipantRole.EDITOR }],
    });

    await expect(
      service.create(createAuthorization(), 20, {
        title: '方案评审会',
        mode: MeetingMode.VIDEO,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
    });
    expect(prisma.meetingSession.create).not.toHaveBeenCalled();
  });

  it('主持人开始会议时应原子更新状态并写入会议开始事件', async () => {
    const { lifecycleService, prisma, transaction } = createServiceHarness();
    const scheduledMeeting = createMeetingRecord();
    const liveMeeting = createMeetingRecord({
      status: MeetingStatus.LIVE,
      startedAt: new Date('2026-07-24T02:30:00.000Z'),
    });
    prisma.meetingSession.findFirst.mockResolvedValue(scheduledMeeting);
    transaction.meetingSession.findUnique.mockResolvedValue(liveMeeting);

    await expect(
      lifecycleService.start(createAuthorization(), 30),
    ).resolves.toMatchObject({
      id: 30,
      status: MeetingStatus.LIVE,
    });
    const startUpdateArgument = getFirstCallArgument(
      transaction.meetingSession.updateMany,
    );
    const startEventArgument = getFirstCallArgument(
      transaction.decisionEvent.create,
    );
    expect(startUpdateArgument).toMatchObject({
      where: { id: 30, status: MeetingStatus.SCHEDULED },
      data: { status: MeetingStatus.LIVE },
    });
    expect(startEventArgument).toMatchObject({
      data: {
        decisionId: 20,
        meetingId: 30,
        actorId: 7,
        type: 'MEETING_STARTED',
      },
    });
  });

  it('同一决策已有进行中会议时不得开始第二场会议', async () => {
    const { lifecycleService, prisma, transaction } = createServiceHarness();
    prisma.meetingSession.findFirst.mockResolvedValue(createMeetingRecord());
    transaction.meetingSession.count.mockResolvedValue(1);

    await expect(
      lifecycleService.start(createAuthorization(), 30),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.MEETING_LIVE_CONFLICT,
    });
    expect(transaction.meetingSession.updateMany).not.toHaveBeenCalled();
    expect(transaction.decisionEvent.create).not.toHaveBeenCalled();
  });

  it('非主持人不能开始会议', async () => {
    const { lifecycleService, prisma } = createServiceHarness();
    prisma.meetingSession.findFirst.mockResolvedValue(
      createMeetingRecord({
        space: {
          decision: {
            id: 20,
            ownerId: 9,
            status: DecisionStatus.DISCUSSING,
          },
        },
      }),
    );

    await expect(
      lifecycleService.start(createAuthorization(8), 30),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
    });
  });

  it('主持人结束会议时应原子更新状态并写入会议结束事件', async () => {
    const { lifecycleService, prisma, transaction } = createServiceHarness();
    const liveMeeting = createMeetingRecord({
      status: MeetingStatus.LIVE,
      startedAt: new Date('2026-07-24T02:30:00.000Z'),
    });
    const endedMeeting = createMeetingRecord({
      status: MeetingStatus.ENDED,
      startedAt: new Date('2026-07-24T02:30:00.000Z'),
      endedAt: new Date('2026-07-24T03:30:00.000Z'),
    });
    prisma.meetingSession.findFirst.mockResolvedValue(liveMeeting);
    transaction.meetingSession.findUnique.mockResolvedValue(endedMeeting);

    await expect(
      lifecycleService.end(createAuthorization(), 30),
    ).resolves.toMatchObject({
      id: 30,
      status: MeetingStatus.ENDED,
    });
    const endUpdateArgument = getFirstCallArgument(
      transaction.meetingSession.updateMany,
    );
    const endEventArgument = getFirstCallArgument(
      transaction.decisionEvent.create,
    );
    expect(endUpdateArgument).toMatchObject({
      where: { id: 30, status: MeetingStatus.LIVE },
      data: { status: MeetingStatus.ENDED },
    });
    expect(endEventArgument).toMatchObject({
      data: {
        decisionId: 20,
        meetingId: 30,
        actorId: 7,
        type: 'MEETING_ENDED',
        payload: { reason: 'HOST_ENDED' },
      },
    });
  });
});
