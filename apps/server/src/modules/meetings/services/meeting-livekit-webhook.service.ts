/**
 * 本文件验签并处理 LiveKit Cloud Webhook，同步参会时间并在房间清空时自动结束会议。
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { WebhookReceiver, type WebhookEvent } from 'livekit-server-sdk';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import { MeetingStatus } from '../../../generated/prisma';
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

    if (event.event === 'participant_joined') {
      await this.handleParticipantJoined(event);
      return;
    }
    if (event.event === 'participant_left') {
      await this.handleParticipantLeft(event);
      return;
    }
    if (event.event === 'room_finished') {
      const meetingId = this.parseMeetingId(event.room?.name);
      if (meetingId) {
        await this.lifecycleService.endIfEmpty(
          meetingId,
          this.readOccurredAt(event),
        );
      }
    }
  }

  /** 记录参与者首次进入时间，并把最近退出时间清空为当前在线状态。 */
  private async handleParticipantJoined(event: WebhookEvent): Promise<void> {
    const meetingId = this.parseMeetingId(event.room?.name);
    const userId = this.parseParticipantId(event.participant?.identity);
    if (!meetingId || !userId) {
      return;
    }

    const joinedAt = this.readOccurredAt(event);
    await this.prisma.$transaction([
      this.prisma.meetingParticipant.updateMany({
        where: {
          meetingId,
          userId,
          joinedAt: null,
          meeting: { status: MeetingStatus.LIVE },
        },
        data: { joinedAt, leftAt: null },
      }),
      this.prisma.meetingParticipant.updateMany({
        where: {
          meetingId,
          userId,
          joinedAt: { not: null },
          meeting: { status: MeetingStatus.LIVE },
        },
        data: { leftAt: null },
      }),
    ]);
  }

  /** 记录参与者最近退出时间，并在已无在线参与者时自动结束业务会议。 */
  private async handleParticipantLeft(event: WebhookEvent): Promise<void> {
    const meetingId = this.parseMeetingId(event.room?.name);
    const userId = this.parseParticipantId(event.participant?.identity);
    if (!meetingId || !userId) {
      return;
    }

    const leftAt = this.readOccurredAt(event);
    await this.prisma.meetingParticipant.updateMany({
      where: {
        meetingId,
        userId,
        meeting: { status: MeetingStatus.LIVE },
      },
      data: { leftAt },
    });
    await this.lifecycleService.endIfEmpty(meetingId, leftAt);
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
}
