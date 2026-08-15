/**
 * 本文件验签并处理 LiveKit Cloud Webhook，同步参会时间并在房间清空时自动结束会议。
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { WebhookReceiver, type WebhookEvent } from 'livekit-server-sdk';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  MeetingInvitationStatus,
  MeetingPresenceEventType,
  MeetingStatus,
} from '../../../generated/prisma';
import { MeetingLifecycleService } from './meeting-lifecycle.service';

const ROOM_ID_PATTERN = /^meeting:(\d+)$/;
const PARTICIPANT_ID_PATTERN = /^user:(\d+)$/;

@Injectable()
export class MeetingLiveKitWebhookService {
  /** 注入 Webhook 验签配置、数据库和会议生命周期服务。 */
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly lifecycleService: MeetingLifecycleService,
  ) {}

  /** 验证 LiveKit 签名并处理当前项目关心的房间及参与人事件。 */
  async handle(rawBody: string, authorization?: string): Promise<void> {
    const event = await this.receiveEvent(rawBody, authorization);

    // room_started 用于确认 LiveKit 已真正建立房间，并保存可排障的服务商房间标识。
    if (event.event === 'room_started') {
      await this.handleRoomStarted(event);
      return;
    }
    // participant_joined 是参会时间和预约会议首次开场的服务端可信来源。
    if (event.event === 'participant_joined') {
      await this.handleParticipantJoined(event);
      return;
    }
    // participant_left 记录每次退出，并在最后一人离开后协调业务会议结束。
    if (event.event === 'participant_left') {
      await this.handleParticipantLeft(event);
      return;
    }
    // participant_connection_aborted 只记录失败尝试，不把网络/权限错误误判为主动拒绝。
    if (event.event === 'participant_connection_aborted') {
      await this.handleParticipantConnectionAborted(event);
      return;
    }
    // room_finished 是 LiveKit 房间终止后的最终对账信号；重复事件由状态条件安全忽略。
    if (event.event === 'room_finished') {
      const meetingId = this.parseMeetingId(event.room?.name);
      if (meetingId) {
        await this.lifecycleService.endIfEmpty(
          meetingId,
          this.readOccurredAt(event),
        );
      }
      return;
    }

    // 轨道、录制、转写、Ingress/Egress 事件不属于本轮业务范围，验签后明确忽略。
  }

  /** 确认 LiveKit 房间启动并回写外部服务商标识。 */
  private async handleRoomStarted(event: WebhookEvent): Promise<void> {
    const meetingId = this.parseMeetingId(event.room?.name);
    if (!meetingId) return;
    await this.prisma.meetingSession.updateMany({
      where: { id: meetingId },
      data: {
        provider: 'LIVEKIT',
        providerRoomId: event.room?.sid || event.room?.name,
      },
    });
  }

  /** 记录参与者首次进入时间，并把最近退出时间清空为当前在线状态。 */
  private async handleParticipantJoined(event: WebhookEvent): Promise<void> {
    const meetingId = this.parseMeetingId(event.room?.name);
    const userId = this.parseParticipantId(event.participant?.identity);
    if (!meetingId || !userId) {
      return;
    }

    const joinedAt = this.readOccurredAt(event);
    await this.prisma.$transaction(async (tx) => {
      await tx.meetingPresenceEvent.createMany({
        data: [
          {
            meetingId,
            userId,
            type: MeetingPresenceEventType.JOINED,
            providerEventId: this.readProviderEventId(event),
            occurredAt: joinedAt,
          },
        ],
        skipDuplicates: true,
      });
      await tx.meetingParticipant.updateMany({
        where: {
          meetingId,
          userId,
          joinedAt: null,
          meeting: {
            status: { in: [MeetingStatus.SCHEDULED, MeetingStatus.LIVE] },
          },
        },
        data: { joinedAt },
      });
      await tx.meetingParticipant.updateMany({
        where: {
          meetingId,
          userId,
          meeting: {
            status: { in: [MeetingStatus.SCHEDULED, MeetingStatus.LIVE] },
          },
        },
        data: {
          leftAt: null,
          invitationStatus: MeetingInvitationStatus.ACCEPTED,
          respondedAt: joinedAt,
        },
      });
      await tx.meetingSession.updateMany({
        where: { id: meetingId, status: MeetingStatus.SCHEDULED },
        data: { status: MeetingStatus.LIVE, startedAt: joinedAt },
      });
    });
  }

  /** 记录参与者最近退出时间，并在已无在线参与者时自动结束业务会议。 */
  private async handleParticipantLeft(event: WebhookEvent): Promise<void> {
    const meetingId = this.parseMeetingId(event.room?.name);
    const userId = this.parseParticipantId(event.participant?.identity);
    if (!meetingId || !userId) {
      return;
    }

    const leftAt = this.readOccurredAt(event);
    await this.prisma.$transaction(async (tx) => {
      await tx.meetingPresenceEvent.createMany({
        data: [
          {
            meetingId,
            userId,
            type: MeetingPresenceEventType.LEFT,
            providerEventId: this.readProviderEventId(event),
            occurredAt: leftAt,
          },
        ],
        skipDuplicates: true,
      });
      await tx.meetingParticipant.updateMany({
        where: {
          meetingId,
          userId,
          meeting: { status: MeetingStatus.LIVE },
        },
        data: { leftAt },
      });
    });
    await this.lifecycleService.endIfEmpty(meetingId, leftAt);
  }

  /** 保存参与人尚未成功连入媒体房间时的连接中止事件。 */
  private async handleParticipantConnectionAborted(
    event: WebhookEvent,
  ): Promise<void> {
    const meetingId = this.parseMeetingId(event.room?.name);
    const userId = this.parseParticipantId(event.participant?.identity);
    if (!meetingId) return;
    await this.prisma.meetingPresenceEvent.createMany({
      data: [
        {
          meetingId,
          userId,
          type: MeetingPresenceEventType.CONNECTION_ABORTED,
          providerEventId: this.readProviderEventId(event),
          occurredAt: this.readOccurredAt(event),
        },
      ],
      skipDuplicates: true,
    });
  }

  /** 使用项目 API Key 和 Secret 验证 Webhook 请求体及 Authorization 签名。 */
  private async receiveEvent(
    rawBody: string,
    authorization?: string,
  ): Promise<WebhookEvent> {
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET');
    if (!apiKey || !apiSecret) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_LIVEKIT_NOT_CONFIGURED,
        message: '音视频服务尚未完成配置，请联系管理员',
        status: 503,
      });
    }

    try {
      return await new WebhookReceiver(apiKey, apiSecret).receive(
        rawBody,
        authorization,
      );
    } catch {
      throw new UnauthorizedException('LiveKit Webhook 签名无效');
    }
  }

  /** 从 `meeting:{id}` 房间名读取可信会议主键。 */
  private parseMeetingId(value?: string): number | null {
    return this.parseScopedId(value, ROOM_ID_PATTERN);
  }

  /** 从 `user:{id}` 参与者身份读取可信用户主键。 */
  private parseParticipantId(value?: string): number | null {
    return this.parseScopedId(value, PARTICIPANT_ID_PATTERN);
  }

  /** 按指定格式解析正整数业务主键，忽略其他 LiveKit 房间和参与者。 */
  private parseScopedId(
    value: string | undefined,
    pattern: RegExp,
  ): number | null {
    const match = value?.match(pattern);
    const id = Number(match?.[1]);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  /** 将 LiveKit 秒级事件时间转换为数据库 Date。 */
  private readOccurredAt(event: WebhookEvent): Date {
    return new Date(Number(event.createdAt) * 1000);
  }

  /** 读取 LiveKit 唯一事件 ID；旧版本缺失时使用稳定字段组合保证重复投递幂等。 */
  private readProviderEventId(event: WebhookEvent): string {
    return (
      event.id ||
      [
        event.event,
        event.room?.sid ?? event.room?.name ?? 'room',
        event.participant?.sid ?? event.participant?.identity ?? 'participant',
        String(event.createdAt),
      ].join(':')
    );
  }
}
