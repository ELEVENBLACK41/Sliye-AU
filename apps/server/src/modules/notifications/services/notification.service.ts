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

/** 快速来电通知需要的倒计时与媒体信息。 */
type MeetingIncomingCallNotificationInput = MeetingNotificationInput & {
  /** 来电停止振铃的时间。 */
  expiresAt: Date;
  /** 来电默认媒体模式。 */
  mediaMode: 'AUDIO' | 'VIDEO';
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

  /** 向受邀人推送可接听或拒绝的快速来电。 */
  notifyMeetingIncomingCall(input: MeetingIncomingCallNotificationInput): void {
    for (const recipientId of new Set(input.recipientIds)) {
      this.gateway.broadcastToUser(recipientId, {
        id: `meeting-call:${input.meetingId}:${recipientId}:${input.occurredAt.getTime()}`,
        type: 'MEETING_INCOMING_CALL',
        title: input.mediaMode === 'VIDEO' ? '收到视频通话' : '收到语音通话',
        message: `${input.actor?.name ?? '会议发起人'}正在呼叫你`,
        occurredAt: input.occurredAt.toISOString(),
        meeting: { id: input.meetingId, title: input.meetingTitle },
        actor: input.actor,
        call: {
          expiresAt: input.expiresAt.toISOString(),
          mediaMode: input.mediaMode,
        },
      });
    }
  }

  /** 把受邀人的接听或拒绝结果推送给会议主持人。 */
  notifyMeetingCallResponse(
    input: MeetingNotificationInput & { accepted: boolean },
  ): void {
    for (const recipientId of new Set(input.recipientIds)) {
      this.gateway.broadcastToUser(recipientId, {
        id: `meeting-call-response:${input.meetingId}:${input.actor?.id ?? 0}:${input.occurredAt.getTime()}`,
        type: 'MEETING_CALL_RESPONSE',
        title: input.accepted ? '成员已接听' : '成员已拒绝',
        message: `${input.actor?.name ?? '受邀成员'}${input.accepted ? '已接听通话' : '拒绝了通话'}`,
        occurredAt: input.occurredAt.toISOString(),
        meeting: { id: input.meetingId, title: input.meetingTitle },
        actor: input.actor,
      });
    }
  }

  /** 通知受邀成员预约会议资料已经更新。 */
  notifyMeetingUpdated(input: MeetingNotificationInput): void {
    this.broadcastMeetingNotification(
      input,
      'MEETING_UPDATED',
      '预约会议已更新',
      `“${input.meetingTitle}”的时间或会议资料已更新`,
    );
  }

  /** 通知受邀成员预约会议已由主持人取消。 */
  notifyMeetingCancelled(input: MeetingNotificationInput): void {
    this.broadcastMeetingNotification(
      input,
      'MEETING_CANCELLED',
      '预约会议已取消',
      `“${input.meetingTitle}”已取消`,
    );
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

  /** 向一组会议参与人广播同一条普通会议通知。 */
  private broadcastMeetingNotification(
    input: MeetingNotificationInput,
    type: 'MEETING_UPDATED' | 'MEETING_CANCELLED',
    title: string,
    message: string,
  ): void {
    for (const recipientId of new Set(input.recipientIds)) {
      this.gateway.broadcastToUser(recipientId, {
        id: `${type.toLowerCase()}:${input.meetingId}:${input.occurredAt.getTime()}`,
        type,
        title,
        message,
        occurredAt: input.occurredAt.toISOString(),
        meeting: { id: input.meetingId, title: input.meetingTitle },
        actor: input.actor,
      });
    }
  }
}
