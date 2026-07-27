/**
 * 本文件验证 LiveKit 会议凭证的受邀成员限制、会议状态限制和令牌授权范围。
 */
import type { ConfigService } from '@nestjs/config';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { TokenVerifier } from 'livekit-server-sdk';
import type { PrismaService } from '../../../database/prisma.service';
import { MeetingStatus } from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { MeetingLiveKitService } from './meeting-livekit.service';

const API_KEY = 'API-nextnest-test';
const API_SECRET =
  'nextnest-livekit-test-secret-with-more-than-thirty-two-characters';

/** 创建 LiveKit 服务测试所需的数据库与配置替身。 */
function createHarness(
  meeting: unknown,
  configuration: Record<string, string | number | undefined> = {},
) {
  const prisma = {
    meetingSession: { findFirst: jest.fn().mockResolvedValue(meeting) },
  };
  const values: Record<string, string | number | undefined> = {
    LIVEKIT_URL: 'wss://nextnest-test.livekit.cloud',
    LIVEKIT_API_KEY: API_KEY,
    LIVEKIT_API_SECRET: API_SECRET,
    LIVEKIT_TOKEN_TTL_SECONDS: 600,
    ...configuration,
  };
  const configService = {
    get: jest.fn(
      (key: string, fallback?: unknown): unknown => values[key] ?? fallback,
    ),
  };

  return {
    prisma,
    service: new MeetingLiveKitService(
      prisma as unknown as PrismaService,
      configService as unknown as ConfigService,
    ),
  };
}

/** 创建只携带当前测试用户身份的授权上下文。 */
function createAuthorization(userId = 7): AuthorizationContext {
  return { userId } as AuthorizationContext;
}

describe('MeetingLiveKitService', () => {
  it('应为进行中会议的受邀用户签发限定房间和身份的令牌', async () => {
    const { prisma, service } = createHarness({
      status: MeetingStatus.LIVE,
      participants: [{ user: { name: '测试用户' } }],
    });

    const credentials = await service.issueCredentials(
      createAuthorization(),
      90,
    );
    const grants = await new TokenVerifier(API_KEY, API_SECRET).verify(
      credentials.participantToken,
    );

    expect(credentials.serverUrl).toBe('wss://nextnest-test.livekit.cloud');
    expect(grants.sub).toBe('user:7');
    expect(grants.name).toBe('测试用户');
    expect(grants.video).toMatchObject({
      room: 'meeting:90',
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    expect(prisma.meetingSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 90,
          participants: { some: { userId: 7 } },
        },
      }),
    );
  });

  it('当前用户未受邀时应隐藏会议并拒绝签发令牌', async () => {
    const { service } = createHarness(null);

    await expect(
      service.issueCredentials(createAuthorization(), 90),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.MEETING_NOT_FOUND });
  });

  it('会议未处于进行中时应拒绝签发令牌', async () => {
    const { service } = createHarness({
      status: MeetingStatus.SCHEDULED,
      participants: [{ user: { name: '测试用户' } }],
    });

    await expect(
      service.issueCredentials(createAuthorization(), 90),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.MEETING_INVALID_STATUS_TRANSITION,
    });
  });

  it('LiveKit 配置不完整时应返回明确的服务不可用错误', async () => {
    const { service } = createHarness(
      {
        status: MeetingStatus.LIVE,
        participants: [{ user: { name: '测试用户' } }],
      },
      { LIVEKIT_API_SECRET: undefined },
    );

    await expect(
      service.issueCredentials(createAuthorization(), 90),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.MEETING_LIVEKIT_NOT_CONFIGURED,
      status: 503,
    });
  });
});
