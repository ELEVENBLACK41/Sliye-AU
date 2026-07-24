/**
 * 本文件验证可选会议上下文的决策归属与进行中状态约束。
 */
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { PrismaService } from '../../../database/prisma.service';
import { MeetingStatus } from '../../../generated/prisma';
import { MeetingContextService } from './meeting-context.service';

describe('MeetingContextService', () => {
  /** 创建仅包含会议查询能力的 Prisma 测试替身。 */
  function createPrisma(findFirstResult: unknown) {
    return {
      meetingSession: {
        findFirst: jest.fn().mockResolvedValue(findFirstResult),
      },
    } as unknown as PrismaService;
  }

  it('未传会议主键时应保留普通协作上下文', async () => {
    const prisma = createPrisma(null);
    const service = new MeetingContextService(prisma);

    await expect(service.resolveWritableMeetingId(20, undefined)).resolves.toBe(
      null,
    );
    // Prisma delegate 方法在断言中不会脱离对象执行。
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.meetingSession.findFirst).not.toHaveBeenCalled();
  });

  it('会议不存在或不属于当前决策时应拒绝写入', async () => {
    const service = new MeetingContextService(createPrisma(null));

    await expect(
      service.resolveWritableMeetingId(20, 90),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.MEETING_NOT_FOUND });
  });

  it('会议未处于进行中时应拒绝写入', async () => {
    const service = new MeetingContextService(
      createPrisma({ id: 90, status: MeetingStatus.SCHEDULED }),
    );

    await expect(
      service.resolveWritableMeetingId(20, 90),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.MEETING_INVALID_STATUS_TRANSITION,
    });
  });

  it('会议属于当前决策且正在进行时应返回会议主键', async () => {
    const prisma = createPrisma({ id: 90, status: MeetingStatus.LIVE });
    const service = new MeetingContextService(prisma);

    await expect(service.resolveWritableMeetingId(20, 90)).resolves.toBe(90);
    // Prisma delegate 方法在断言中不会脱离对象执行。
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.meetingSession.findFirst).toHaveBeenCalledWith({
      where: {
        id: 90,
        space: { decision: { is: { id: 20 } } },
      },
      select: { id: true, status: true },
    });
  });
});
