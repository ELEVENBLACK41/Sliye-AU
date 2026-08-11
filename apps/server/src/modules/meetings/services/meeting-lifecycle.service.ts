/**
 * 本文件负责分区会议的开始、结束、主持权限和多决策时间线事件。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { MeetingDetail } from '@workspace/contracts/meetings';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  DecisionEventType,
  MeetingParticipantRole,
  MeetingStatus,
  type Prisma,
} from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { ProjectAccessService } from '../../projects/services/project-access.service';
import { NotificationService } from '../../notifications/services/notification.service';
import {
  meetingDetailInclude,
  toMeetingDetail,
  type MeetingDetailRecord,
} from '../meetings.mapper';
import { MeetingLiveKitService } from './meeting-livekit.service';

@Injectable()
export class MeetingLifecycleService {
  /** 注入数据库、项目分区授权、LiveKit 房间管理和全站通知服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccessService: ProjectAccessService,
    private readonly liveKitService: MeetingLiveKitService,
    private readonly notificationService: NotificationService,
  ) {}

  /** 开始一场计划会议，并为每项关联决策分别写入开始事件。 */
  async start(
    authorization: AuthorizationContext,
    meetingId: number,
  ): Promise<MeetingDetail> {
    const meeting = await this.findAccessibleMeeting(authorization, meetingId);
    const area = meeting.area
      ? await this.projectAccessService.findArea(
          authorization,
          meeting.area.projectId,
          meeting.area.id,
        )
      : null;
    this.assertMeetingHost(
      authorization,
      meeting,
      '只有会议主持人可以开始会议',
    );
    if (area) this.projectAccessService.assertAreaWritable(area);
    if (meeting.status !== MeetingStatus.SCHEDULED) {
      this.throwInvalidTransition('当前会议状态不能开始会议');
    }

    const startedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.meetingSession.updateMany({
        where: { id: meeting.id, status: MeetingStatus.SCHEDULED },
        data: { status: MeetingStatus.LIVE, startedAt },
      });
      if (result.count !== 1) {
        this.throwInvalidTransition('会议状态已经变化，请刷新后重试');
      }

      await this.createLifecycleEvents(
        tx,
        meeting,
        authorization.userId,
        DecisionEventType.MEETING_STARTED,
        '开始会议',
        MeetingStatus.SCHEDULED,
        MeetingStatus.LIVE,
        startedAt,
      );
      return this.findMeetingInTransaction(tx, meeting.id);
    });

    return toMeetingDetail(updated);
  }

  /** LiveKit 房间已无在线参与者时，以系统事件自动结束仍在进行的业务会议。 */
  async endIfEmpty(meetingId: number, endedAt: Date): Promise<boolean> {
    const endedMeeting = await this.prisma.$transaction(async (tx) => {
      const joinedParticipantCount = await tx.meetingParticipant.count({
        where: {
          meetingId,
          joinedAt: { not: null },
        },
      });
      if (joinedParticipantCount === 0) {
        return null;
      }

      const activeParticipantCount = await tx.meetingParticipant.count({
        where: {
          meetingId,
          joinedAt: { not: null },
          leftAt: null,
        },
      });
      if (activeParticipantCount > 0) {
        return null;
      }

      const result = await tx.meetingSession.updateMany({
        where: { id: meetingId, status: MeetingStatus.LIVE },
        data: { status: MeetingStatus.ENDED, endedAt },
      });
      if (result.count !== 1) {
        return null;
      }

      const meeting = await this.findMeetingInTransaction(tx, meetingId);
      await this.createLifecycleEvents(
        tx,
        meeting,
        null,
        DecisionEventType.MEETING_ENDED,
        '全部参会人已退出，会议自动结束',
        MeetingStatus.LIVE,
        MeetingStatus.ENDED,
        endedAt,
      );
      return meeting;
    });

    if (!endedMeeting) {
      return false;
    }
    this.notificationService.notifyMeetingEnded({
      recipientIds: endedMeeting.participants.map(
        (participant) => participant.userId,
      ),
      meetingId: endedMeeting.id,
      meetingTitle: endedMeeting.title,
      occurredAt: endedAt,
    });
    return true;
  }

  /** 结束一场进行中的会议，并为每项关联决策分别写入结束事件。 */
  async end(
    authorization: AuthorizationContext,
    meetingId: number,
  ): Promise<MeetingDetail> {
    const meeting = await this.findAccessibleMeeting(authorization, meetingId);
    this.assertMeetingHost(
      authorization,
      meeting,
      '只有会议主持人可以结束会议',
    );
    if (meeting.status !== MeetingStatus.LIVE) {
      this.throwInvalidTransition('只有进行中的会议可以结束');
    }

    const endedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.meetingSession.updateMany({
        where: { id: meeting.id, status: MeetingStatus.LIVE },
        data: { status: MeetingStatus.ENDED, endedAt },
      });
      if (result.count !== 1) {
        this.throwInvalidTransition('会议状态已经变化，请刷新后重试');
      }

      await this.createLifecycleEvents(
        tx,
        meeting,
        authorization.userId,
        DecisionEventType.MEETING_ENDED,
        '结束会议',
        MeetingStatus.LIVE,
        MeetingStatus.ENDED,
        endedAt,
      );
      return this.findMeetingInTransaction(tx, meeting.id);
    });

    await this.liveKitService.closeRoom(meeting.id);
    this.notificationService.notifyMeetingEnded({
      recipientIds: meeting.participants
        .map((participant) => participant.userId)
        .filter((userId) => userId !== authorization.userId),
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      actor: {
        id: authorization.userId,
        name:
          meeting.participants.find(
            (participant) => participant.userId === authorization.userId,
          )?.user.name ?? '会议主持人',
      },
      occurredAt: endedAt,
    });

    return toMeetingDetail(updated);
  }

  /** 查询当前用户受邀且仍满足可选项目分区可见性的会议。 */
  private async findAccessibleMeeting(
    authorization: AuthorizationContext,
    meetingId: number,
  ): Promise<MeetingDetailRecord> {
    const meeting = await this.prisma.meetingSession.findFirst({
      where: {
        id: meetingId,
        participants: { some: { userId: authorization.userId } },
        OR: [
          { areaId: null },
          {
            area: this.projectAccessService.buildVisibleAreaWhere(
              authorization.userId,
            ),
          },
        ],
      },
      include: meetingDetailInclude,
    });
    if (!meeting) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_NOT_FOUND,
        message: '会议不存在或当前账号无权访问',
        status: 404,
      });
    }

    return meeting;
  }

  /** 断言当前用户在会议中是主持人或联合主持人。 */
  private assertMeetingHost(
    authorization: AuthorizationContext,
    meeting: MeetingDetailRecord,
    message: string,
  ): void {
    const isHost = meeting.participants.some(
      (participant) =>
        participant.userId === authorization.userId &&
        (participant.role === MeetingParticipantRole.HOST ||
          participant.role === MeetingParticipantRole.CO_HOST),
    );
    if (!isHost) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
        message,
        status: 403,
      });
    }
  }

  /** 为会议关联的每项决策写入独立生命周期事件；普通会议不写决策时间线。 */
  private async createLifecycleEvents(
    tx: Prisma.TransactionClient,
    meeting: MeetingDetailRecord,
    actorId: number | null,
    type: DecisionEventType,
    title: string,
    beforeStatus: MeetingStatus,
    afterStatus: MeetingStatus,
    occurredAt: Date,
  ): Promise<void> {
    if (meeting.decisionLinks.length === 0) {
      return;
    }

    await tx.decisionEvent.createMany({
      data: meeting.decisionLinks.map(({ decisionId }) => ({
        decisionId,
        meetingId: meeting.id,
        actorId,
        type,
        title,
        payload: { meetingTitle: meeting.title },
        before: { status: beforeStatus },
        after: {
          status: afterStatus,
          occurredAt: occurredAt.toISOString(),
        },
        occurredAt,
      })),
    });
  }

  /** 在会项目务内读取最终详情。 */
  private async findMeetingInTransaction(
    tx: Prisma.TransactionClient,
    meetingId: number,
  ): Promise<MeetingDetailRecord> {
    const meeting = await tx.meetingSession.findUnique({
      where: { id: meetingId },
      include: meetingDetailInclude,
    });
    if (!meeting) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_INTERNAL_ERROR,
        message: '会议状态更新失败，请稍后重试',
        status: 500,
      });
    }

    return meeting;
  }

  /** 抛出会议状态不能继续流转的稳定冲突异常。 */
  private throwInvalidTransition(message: string): never {
    throw new BusinessException({
      code: API_ERROR_CODES.MEETING_INVALID_STATUS_TRANSITION,
      message,
      status: 409,
    });
  }
}
