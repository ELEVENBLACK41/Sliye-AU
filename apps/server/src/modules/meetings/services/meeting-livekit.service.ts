/**
 * 本文件负责校验会议参与资格，并为真实 LiveKit 音视频房间签发短期加入令牌。
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { MeetingLiveKitCredentials } from '@workspace/contracts/meetings';
import { AccessToken } from 'livekit-server-sdk';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import { MeetingStatus } from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';

/** LiveKit 房间和参与者稳定身份的业务前缀。 */
const LIVEKIT_ROOM_PREFIX = 'meeting';
const LIVEKIT_PARTICIPANT_PREFIX = 'user';

@Injectable()
export class MeetingLiveKitService {
  /** 注入数据库和服务端配置，密钥始终只在 NestJS 内使用。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /** 为当前受邀用户签发只能加入指定进行中会议的短期令牌。 */
  async issueCredentials(
    authorization: AuthorizationContext,
    meetingId: number,
  ): Promise<MeetingLiveKitCredentials> {
    const meeting = await this.prisma.meetingSession.findFirst({
      where: {
        id: meetingId,
        participants: { some: { userId: authorization.userId } },
      },
      select: {
        status: true,
        participants: {
          where: { userId: authorization.userId },
          select: { user: { select: { name: true } } },
          take: 1,
        },
      },
    });
    if (!meeting) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_NOT_FOUND,
        message: '会议不存在或当前用户未受邀',
        status: 404,
      });
    }
    if (meeting.status !== MeetingStatus.LIVE) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_INVALID_STATUS_TRANSITION,
        message: '只有进行中的会议可以加入音视频房间',
        status: 409,
      });
    }

    const configuration = this.readConfiguration();
    const participantName =
      meeting.participants[0]?.user.name ?? `用户 ${authorization.userId}`;
    const accessToken = new AccessToken(
      configuration.apiKey,
      configuration.apiSecret,
      {
        identity: `${LIVEKIT_PARTICIPANT_PREFIX}:${authorization.userId}`,
        name: participantName,
        ttl: configuration.ttlSeconds,
      },
    );
    accessToken.addGrant({
      room: `${LIVEKIT_ROOM_PREFIX}:${meetingId}`,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return {
      serverUrl: configuration.serverUrl,
      participantToken: await accessToken.toJwt(),
    };
  }

  /** 读取完整 LiveKit 配置，缺少任一凭据时返回可诊断的服务不可用错误。 */
  private readConfiguration(): {
    serverUrl: string;
    apiKey: string;
    apiSecret: string;
    ttlSeconds: number;
  } {
    const serverUrl = this.configService.get<string>('LIVEKIT_URL');
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET');
    const ttlSeconds = this.configService.get<number>(
      'LIVEKIT_TOKEN_TTL_SECONDS',
      600,
    );

    if (!serverUrl || !apiKey || !apiSecret) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_LIVEKIT_NOT_CONFIGURED,
        message: '音视频服务尚未完成配置，请联系管理员',
        status: 503,
      });
    }

    return { serverUrl, apiKey, apiSecret, ttlSeconds };
  }
}
