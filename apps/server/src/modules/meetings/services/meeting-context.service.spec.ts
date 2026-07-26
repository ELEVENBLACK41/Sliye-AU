/**
 * 本文件验证多决策会议上下文、操作人受邀关系和私有会议成员完整性。
 */
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { PrismaService } from '../../../database/prisma.service';
import { DiscussionAreaType, MeetingStatus } from '../../../generated/prisma';
import { MeetingContextService } from './meeting-context.service';

/** 创建会议上下文服务所需的最小 Prisma 替身。 */
function createHarness(meeting: unknown, decision: unknown = null) {
  const prisma = {
    meetingSession: { findFirst: jest.fn().mockResolvedValue(meeting) },
    decision: { findUnique: jest.fn().mockResolvedValue(decision) },
  };

  return {
    prisma,
    service: new MeetingContextService(prisma as unknown as PrismaService),
  };
}

describe('MeetingContextService', () => {
  it('未传会议主键时应保留普通议事协作上下文', async () => {
    const { prisma, service } = createHarness(null);

    await expect(
      service.resolveWritableMeetingId(20, undefined, 7),
    ).resolves.toBeNull();
    expect(prisma.meetingSession.findFirst).not.toHaveBeenCalled();
  });

  it('会议不存在、未关联决策或操作人未受邀时应拒绝写入', async () => {
    const { service } = createHarness(null);

    await expect(
      service.resolveWritableMeetingId(20, 90, 7),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.MEETING_NOT_FOUND });
  });

  it('会议未处于进行中时应拒绝写入', async () => {
    const { service } = createHarness({
      id: 90,
      status: MeetingStatus.SCHEDULED,
      area: { type: DiscussionAreaType.PUBLIC, members: [] },
      participants: [{ userId: 7 }],
    });

    await expect(
      service.resolveWritableMeetingId(20, 90, 7),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.MEETING_INVALID_STATUS_TRANSITION,
    });
  });

  it('公共会议已关联决策且操作人受邀时应返回会议主键', async () => {
    const { prisma, service } = createHarness({
      id: 90,
      status: MeetingStatus.LIVE,
      area: { type: DiscussionAreaType.PUBLIC, members: [] },
      participants: [{ userId: 7 }],
    });

    await expect(service.resolveWritableMeetingId(20, 90, 7)).resolves.toBe(90);
    expect(prisma.meetingSession.findFirst).toHaveBeenCalledWith({
      where: {
        id: 90,
        decisionLinks: { some: { decisionId: 20 } },
        participants: { some: { userId: 7 } },
        area: { matter: { decisions: { some: { id: 20 } } } },
      },
      select: {
        id: true,
        status: true,
        area: {
          select: {
            type: true,
            members: { select: { userId: true } },
          },
        },
        participants: { select: { userId: true } },
      },
    });
  });

  it('私有会议缺少任一决策参与者时应返回明确冲突', async () => {
    const { service } = createHarness(
      {
        id: 90,
        status: MeetingStatus.LIVE,
        area: {
          type: DiscussionAreaType.PRIVATE,
          members: [{ userId: 7 }],
        },
        participants: [{ userId: 7 }],
      },
      { participants: [{ userId: 7 }, { userId: 8 }] },
    );

    await expect(
      service.resolveWritableMeetingId(20, 90, 7),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.MEETING_PRIVATE_DECISION_PARTICIPANTS_INCOMPLETE,
      status: 409,
    });
  });

  it('私有会议包含全部决策参与者时应允许正式操作', async () => {
    const { service } = createHarness(
      {
        id: 90,
        status: MeetingStatus.LIVE,
        area: {
          type: DiscussionAreaType.PRIVATE,
          members: [{ userId: 7 }, { userId: 8 }],
        },
        participants: [{ userId: 7 }, { userId: 8 }],
      },
      { participants: [{ userId: 7 }, { userId: 8 }] },
    );

    await expect(service.resolveWritableMeetingId(20, 90, 7)).resolves.toBe(90);
  });
});
