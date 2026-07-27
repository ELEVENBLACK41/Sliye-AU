/**
 * 本文件提供全站通知 Ticket 签发和业务通知广播入口。
 */
import { Injectable } from '@nestjs/common';
import type {
  NotificationSocketTicket,
  RealtimeNotification,
} from '@workspace/contracts/notifications';
import { NotificationGateway } from '../gateways/notification.gateway';
import { NotificationTicketService } from './notification-ticket.service';

/** 发送会议通知需要的稳定业务信息。 */
type MeetingNotificationInput = {
  /** 接收通知的用户主键集合。 */
  recipientIds: readonly number[];
  /** 会议主键。 */
  meetingId: number;
  /** 会议标题。 */
  meetingTitle: string;
  /** 可选的业务操作人。 */
  actor?: { id: number; name: string };
  /** 通知发生时间。 */
  occurredAt: Date;
};

@Injectable()
export class NotificationService {
  /** 注入 Ticket 服务和用户级实时广播 Gateway。 */
  constructor(
    private readonly ticketService: NotificationTicketService,
    private readonly gateway: NotificationGateway,
  ) {}

  /** 为当前登录用户签发全站通知 Socket Ticket。 */
  issueTicket(userId: number, sessionId: string): NotificationSocketTicket {
    return this.ticketService.issue({ userId, sessionId });
  }

  /** 通知受邀成员一场新的会议已经创建。 */
  notifyMeetingInvited(input: MeetingNotificationInput): void {
    for (const recipientId of new Set(input.recipientIds)) {
      this.gateway.broadcastToUser(recipientId, {
        id: `meeting-invited:${input.meetingId}:${recipientId}`,
        type: 'MEETING_INVITED',
        title: '收到新的会议邀请',
        message: `${input.actor?.name ?? '会议主持人'}邀请你参加“${input.meetingTitle}”`,
        occurredAt: input.occurredAt.toISOString(),
        meeting: { id: input.meetingId, title: input.meetingTitle },
        actor: input.actor,
      });
    }
  }

  /** 通知参会成员会议已经结束。 */
  notifyMeetingEnded(input: MeetingNotificationInput): void {
    const notification: Omit<RealtimeNotification, 'id'> = {
      type: 'MEETING_ENDED',
      title: '当前会议已结束',
      message: `“${input.meetingTitle}”已结束，你可以继续查看本场会议记录`,
      occurredAt: input.occurredAt.toISOString(),
      meeting: { id: input.meetingId, title: input.meetingTitle },
      actor: input.actor,
    };
    for (const recipientId of new Set(input.recipientIds)) {
      this.gateway.broadcastToUser(recipientId, {
        id: `meeting-ended:${input.meetingId}`,
        ...notification,
      });
    }
  }
}
