/**
 * 本文件验证 LiveKit Webhook 对参会时间和空房自动结束逻辑的同步。
 */
import type { ConfigService } from '@nestjs/config';
import { WebhookReceiver, type WebhookEvent } from 'livekit-server-sdk';
import type { PrismaService } from '../../../database/prisma.service';
import type { MeetingLifecycleService } from './meeting-lifecycle.service';
import { MeetingLiveKitWebhookService } from './meeting-livekit-webhook.service';

/** 创建 Webhook 服务测试所需的依赖替身。 */
function createHarness() {
  const prisma = {
    meetingPresenceEvent: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    meetingParticipant: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    meetingSession: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (callback: (client: typeof prisma) => Promise<unknown>) => callback(prisma),
  );
  const lifecycleService = {
    endIfEmpty: jest.fn().mockResolvedValue(true),
  };
  const configService = {
    get: jest.fn((key: string) =>
      key === 'LIVEKIT_API_KEY' ? 'test-key' : 'test-secret',
    ),
  };

  return {
    prisma,
    lifecycleService,
    service: new MeetingLiveKitWebhookService(
      configService as unknown as ConfigService,
      prisma as unknown as PrismaService,
      lifecycleService as unknown as MeetingLifecycleService,
    ),
  };
}

describe('MeetingLiveKitWebhookService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('参会人进入时应同步首次进入时间并清空最近退出时间', async () => {
    const { prisma, service } = createHarness();
    jest.spyOn(WebhookReceiver.prototype, 'receive').mockResolvedValue({
      event: 'participant_joined',
      createdAt: 1_700_000_000n,
      room: { name: 'meeting:90' },
      participant: { identity: 'user:7' },
    } as WebhookEvent);

    await service.handle('{}', 'signed-token');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.meetingParticipant.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.meetingParticipant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // Jest 非对称匹配器会退化为 any，仅用于校验数据库筛选条件。
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({ meetingId: 90, userId: 7 }),
        data: { joinedAt: new Date('2023-11-14T22:13:20.000Z') },
      }),
    );
    expect(prisma.meetingPresenceEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('最后一位参会人退出时应记录退出时间并尝试自动结束会议', async () => {
    const { prisma, lifecycleService, service } = createHarness();
    jest.spyOn(WebhookReceiver.prototype, 'receive').mockResolvedValue({
      event: 'participant_left',
      createdAt: 1_700_000_000n,
      room: { name: 'meeting:90' },
      participant: { identity: 'user:7' },
    } as WebhookEvent);

    await service.handle('{}', 'signed-token');

    const leftAt = new Date('2023-11-14T22:13:20.000Z');
    expect(prisma.meetingParticipant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // Jest 非对称匹配器会退化为 any，仅用于校验数据库筛选条件。
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({ meetingId: 90, userId: 7 }),
        data: { leftAt },
      }),
    );
    expect(lifecycleService.endIfEmpty).toHaveBeenCalledWith(90, leftAt);
  });

  it('连接中止时只保存失败历史，不结束会议', async () => {
    const { prisma, lifecycleService, service } = createHarness();
    jest.spyOn(WebhookReceiver.prototype, 'receive').mockResolvedValue({
      id: 'event-aborted-1',
      event: 'participant_connection_aborted',
      createdAt: 1_700_000_000n,
      room: { name: 'meeting:90' },
      participant: { identity: 'user:7' },
    } as WebhookEvent);

    await service.handle('{}', 'signed-token');

    expect(prisma.meetingPresenceEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          meetingId: 90,
          userId: 7,
          providerEventId: 'event-aborted-1',
        }),
      ],
      skipDuplicates: true,
    });
    expect(lifecycleService.endIfEmpty).not.toHaveBeenCalled();
  });
});
