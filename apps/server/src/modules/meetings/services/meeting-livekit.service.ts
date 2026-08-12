/**
 * 本文件负责校验会议参与资格，并为真实 LiveKit 音视频房间签发短期加入令牌。
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { MeetingLiveKitCredentials } from '@workspace/contracts/meetings';
import {
  AccessToken,
  RoomServiceClient,
  ServerError,
} from 'livekit-server-sdk';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  MeetingInvitationStatus,
  MeetingKind,
  MeetingParticipantRole,
  MeetingStatus,
} from '../../../generated/prisma';
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
        kind: true,
        scheduledAt: true,
        scheduledDurationMinutes: true,
        ringExpiresAt: true,
        participants: {
          where: { userId: authorization.userId },
          select: {
            role: true,
            invitationStatus: true,
            user: { select: { name: true } },
          },
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
    const now = new Date();
    const participant = meeting.participants[0];
    const tokenTtlSeconds = this.assertEntryAllowed(meeting, participant, now);

    const configuration = this.readConfiguration();
    const roomName = `${LIVEKIT_ROOM_PREFIX}:${meetingId}`;
    await this.ensureRoom(configuration, roomName);
    const participantName =
      meeting.participants[0]?.user.name ?? `用户 ${authorization.userId}`;
    const accessToken = new AccessToken(
      configuration.apiKey,
      configuration.apiSecret,
      {
        identity: `${LIVEKIT_PARTICIPANT_PREFIX}:${authorization.userId}`,
        name: participantName,
        ttl: Math.min(configuration.ttlSeconds, tokenTtlSeconds),
      },
    );
    accessToken.addGrant({
      room: roomName,
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

  /** 校验快速通话响应和预约会议提前三十分钟开放窗口。 */
  private assertEntryAllowed(
    meeting: {
      status: MeetingStatus;
      kind: MeetingKind;
      scheduledAt: Date | null;
      scheduledDurationMinutes: number | null;
      ringExpiresAt: Date | null;
    },
    participant: {
      role: MeetingParticipantRole;
      invitationStatus: MeetingInvitationStatus | null;
    },
    now: Date,
  ): number {
    if (meeting.kind === MeetingKind.QUICK_CALL) {
      const isHost = participant.role === MeetingParticipantRole.HOST;
      const hasResponded =
        participant.invitationStatus === MeetingInvitationStatus.ACCEPTED;
      const declinedRinging =
        participant.invitationStatus === MeetingInvitationStatus.DECLINED;
      if (
        meeting.status !== MeetingStatus.LIVE ||
        (!isHost && !hasResponded && !declinedRinging)
      ) {
        throw new BusinessException({
          code: API_ERROR_CODES.MEETING_INVALID_STATUS_TRANSITION,
          message: '请先接听仍在振铃的快速通话',
          status: 409,
        });
      }
      return this.configService.get<number>('LIVEKIT_TOKEN_TTL_SECONDS', 600);
    }

    if (meeting.status === MeetingStatus.LIVE) {
      return this.configService.get<number>('LIVEKIT_TOKEN_TTL_SECONDS', 600);
    }
    if (
      meeting.status !== MeetingStatus.SCHEDULED ||
      !meeting.scheduledAt ||
      !meeting.scheduledDurationMinutes
    ) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_INVALID_STATUS_TRANSITION,
        message: '当前预约会议不能加入音视频房间',
        status: 409,
      });
    }
    const opensAt = new Date(meeting.scheduledAt.getTime() - 30 * 60_000);
    const closesAt = new Date(
      meeting.scheduledAt.getTime() + meeting.scheduledDurationMinutes * 60_000,
    );
    if (now < opensAt) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_ENTRY_NOT_OPEN,
        message: '预约会议将在计划时间前 30 分钟开放',
        status: 409,
      });
    }
    if (now >= closesAt) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_CALL_EXPIRED,
        message: '预约会议的最晚入场时间已过',
        status: 409,
      });
    }
    return Math.max(1, Math.floor((closesAt.getTime() - now.getTime()) / 1000));
  }

  /** 主持人结束业务会议时删除对应 LiveKit 房间并断开全部在线参与者。 */
  async closeRoom(meetingId: number): Promise<void> {
    const configuration = this.readConfiguration();
    const client = this.createRoomServiceClient(configuration);

    try {
      await client.deleteRoom(`${LIVEKIT_ROOM_PREFIX}:${meetingId}`);
    } catch (error) {
      if (error instanceof ServerError && error.status === 404) {
        return;
      }

      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_LIVEKIT_ROOM_CLOSE_FAILED,
        message: '会议状态已结束，但音视频房间关闭失败，请稍后重试',
        status: 502,
        cause: error,
      });
    }
  }

  /** 查询指定业务用户是否已经真实连入 LiveKit 房间，用于 webhook 延迟时补偿生命周期。 */
  async isParticipantConnected(
    meetingId: number,
    userId: number,
  ): Promise<boolean> {
    const configuration = this.readConfiguration();
    const client = this.createRoomServiceClient(configuration);

    try {
      const participants = await client.listParticipants(
        `${LIVEKIT_ROOM_PREFIX}:${meetingId}`,
      );
      return participants.some(
        (participant) =>
          participant.identity === `${LIVEKIT_PARTICIPANT_PREFIX}:${userId}`,
      );
    } catch (error) {
      if (error instanceof ServerError && error.status === 404) return false;
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_LIVEKIT_ROOM_QUERY_FAILED,
        message: '暂时无法确认主持人的在线状态，请稍后重试',
        status: 502,
        cause: error,
      });
    }
  }

  /** 显式创建短暂宽限后关闭的 LiveKit 房间，确保最后一人退出后及时释放房间。 */
  private async ensureRoom(
    configuration: LiveKitConfiguration,
    roomName: string,
  ): Promise<void> {
    const client = this.createRoomServiceClient(configuration);
    await client.createRoom({
      name: roomName,
      emptyTimeout: 300,
      departureTimeout: 1,
    });
  }

  /** 使用 HTTP(S) 管理地址创建 LiveKit 服务端房间客户端。 */
  private createRoomServiceClient(
    configuration: LiveKitConfiguration,
  ): RoomServiceClient {
    return new RoomServiceClient(
      this.toServerApiUrl(configuration.serverUrl),
      configuration.apiKey,
      configuration.apiSecret,
    );
  }

  /** 将浏览器使用的 WebSocket 地址转换为服务端 Room API 地址。 */
  private toServerApiUrl(serverUrl: string): string {
    const url = new URL(serverUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    return url.toString().replace(/\/$/, '');
  }

  /** 读取完整 LiveKit 配置，缺少任一凭据时返回可诊断的服务不可用错误。 */
  private readConfiguration(): LiveKitConfiguration {
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

/** 服务端签发令牌和管理房间所需的完整 LiveKit 配置。 */
type LiveKitConfiguration = {
  /** 浏览器连接 LiveKit 使用的 WebSocket 地址。 */
  serverUrl: string;
  /** LiveKit Cloud 项目 API Key。 */
  apiKey: string;
  /** 只允许服务端持有的 LiveKit Cloud API Secret。 */
  apiSecret: string;
  /** 参与者加入令牌有效秒数。 */
  ttlSeconds: number;
};
