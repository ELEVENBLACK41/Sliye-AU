/**
 * 本文件验证快速通话未接和预约会议无人入场的幂等过期协调。
 */
import type { PrismaService } from '../../../database/prisma.service';
import { MeetingStatus } from '../../../generated/prisma';
import type { MeetingLiveKitService } from './meeting-livekit.service';
import { MeetingExpirationService } from './meeting-expiration.service';

/** 创建过期协调服务测试替身。 */
function createHarness() {
  const meetingSession = {
    findMany: jest
      .fn()
      .mockResolvedValueOnce([{ id: 11 }])
      .mockResolvedValueOnce([
        {
          id: 12,
          scheduledAt: new Date('2026-08-11T01:00:00.000Z'),
          scheduledDurationMinutes: 60,
        },
      ]),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const meetingParticipant = {
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const prisma = {
    meetingSession,
    meetingParticipant,
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (callback: (client: typeof prisma) => Promise<unknown>) => callback(prisma),
  );
  const liveKitService = {
    closeRoom: jest.fn().mockResolvedValue(undefined),
  };
  return {
    prisma,
    liveKitService,
    service: new MeetingExpirationService(
      prisma as unknown as PrismaService,
      liveKitService as unknown as MeetingLiveKitService,
    ),
  };
}

describe('MeetingExpirationService', () => {
  it('应把无人接听快速通话和无人入场预约会议标记为已过期', async () => {
    const { prisma, liveKitService, service } = createHarness();
    const now = new Date('2026-08-11T03:00:00.000Z');

    await service.reconcileExpiredMeetings(now);

    expect(prisma.meetingSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: MeetingStatus.EXPIRED, endedAt: now },
      }),
    );
    expect(prisma.meetingParticipant.updateMany).toHaveBeenCalledTimes(1);
    expect(liveKitService.closeRoom).toHaveBeenCalledWith(11);
    expect(prisma.meetingSession.updateMany).toHaveBeenCalledWith({
      where: { id: 12, status: MeetingStatus.SCHEDULED, startedAt: null },
      data: {
        status: MeetingStatus.EXPIRED,
        endedAt: new Date('2026-08-11T02:00:00.000Z'),
      },
    });
  });
});
