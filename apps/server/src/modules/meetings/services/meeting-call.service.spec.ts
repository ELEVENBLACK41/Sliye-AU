/**
 * 本文件验证独立快速通话创建和全系统联系人候选查询。
 */
import type { PrismaService } from '../../../database/prisma.service';
import {
  MeetingInvitationStatus,
  MeetingKind,
  MeetingMediaMode,
  MeetingParticipantRole,
  MeetingStatus,
} from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import type { NotificationService } from '../../notifications/services/notification.service';
import type { ProjectAccessService } from '../../projects/services/project-access.service';
import { MeetingCallService } from './meeting-call.service';

/** 创建快速通话服务测试替身。 */
function createHarness() {
  const now = new Date('2026-08-11T02:00:00.000Z');
  const meetingRecord = {
    id: 30,
    areaId: null,
    createdById: 7,
    title: '负责人发起的快速通话',
    description: null,
    status: MeetingStatus.LIVE,
    kind: MeetingKind.QUICK_CALL,
    mediaMode: MeetingMediaMode.VIDEO,
    roomKey: 'room-key',
    provider: null,
    providerRoomId: null,
    scheduledAt: null,
    scheduledDurationMinutes: null,
    ringExpiresAt: new Date(now.getTime() + 30_000),
    startedAt: now,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
    area: null,
    createdBy: { id: 7, name: '负责人', avatarUrl: null },
    decisionLinks: [],
    _count: { participants: 2 },
    participants: [
      {
        id: 1,
        meetingId: 30,
        userId: 7,
        role: MeetingParticipantRole.HOST,
        invitationStatus: MeetingInvitationStatus.ACCEPTED,
        respondedAt: now,
        joinedAt: null,
        leftAt: null,
        createdAt: now,
        user: { id: 7, name: '负责人', avatarUrl: null },
      },
      {
        id: 2,
        meetingId: 30,
        userId: 8,
        role: MeetingParticipantRole.ATTENDEE,
        invitationStatus: MeetingInvitationStatus.INVITED,
        respondedAt: null,
        joinedAt: null,
        leftAt: null,
        createdAt: now,
        user: { id: 8, name: '成员', avatarUrl: null },
      },
    ],
  };
  const findCandidates = jest.fn(
    (query: { where: { id: { not: number } } }) => {
      void query;
      return Promise.resolve([
        {
          id: 8,
          name: '成员',
          email: 'member@example.com',
          avatarUrl: null,
          department: { name: '产品部' },
        },
      ]);
    },
  );
  const createMeeting = jest.fn(
    (query: {
      data: { areaId: number | null; ringExpiresAt: Date | null };
    }) => {
      void query;
      return Promise.resolve(meetingRecord);
    },
  );
  const prisma = {
    user: {
      findMany: findCandidates,
      count: jest.fn().mockResolvedValue(2),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ name: '负责人' }),
    },
    meetingSession: {
      create: createMeeting,
    },
  };
  const projectAccessService = {};
  const notificationService = {
    notifyMeetingIncomingCall: jest.fn(),
  };
  return {
    prisma,
    notificationService,
    service: new MeetingCallService(
      prisma as unknown as PrismaService,
      projectAccessService as ProjectAccessService,
      notificationService as unknown as NotificationService,
    ),
  };
}

/** 创建当前登录用户授权上下文。 */
function createAuthorization(): AuthorizationContext {
  return { userId: 7 } as AuthorizationContext;
}

describe('MeetingCallService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('应分页查询全部正常联系人并排除当前用户', async () => {
    const { service, prisma } = createHarness();

    await expect(
      service.listParticipantCandidates(createAuthorization(), {
        keyword: '产品',
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toEqual({
      items: [
        {
          id: 8,
          name: '成员',
          email: 'member@example.com',
          avatarUrl: null,
          departmentName: '产品部',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 2,
    });
    const candidateQuery = prisma.user.findMany.mock.calls[0]?.[0];
    expect(candidateQuery?.where).toMatchObject({ id: { not: 7 } });
  });

  it('应创建三十秒振铃的独立快速通话并通知受邀人', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-11T02:00:00.000Z'));
    const { service, prisma, notificationService } = createHarness();

    const meeting = await service.createQuickCall(createAuthorization(), {
      mediaMode: 'VIDEO',
      participantIds: [8],
      decisionIds: [],
    });

    expect(meeting).toMatchObject({
      id: 30,
      projectId: null,
      kind: 'QUICK_CALL',
      status: 'LIVE',
    });
    const createQuery = prisma.meetingSession.create.mock.calls[0]?.[0];
    expect(createQuery?.data).toMatchObject({
      areaId: null,
      ringExpiresAt: new Date('2026-08-11T02:00:30.000Z'),
    });
    expect(notificationService.notifyMeetingIncomingCall).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: [8], meetingId: 30 }),
    );
  });
});
