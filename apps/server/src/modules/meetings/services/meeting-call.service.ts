/**
 * 本文件实现独立/项目快速通话、预约会议、联系人和来电响应业务。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type {
  IncomingMeetingCallsResponse,
  MeetingDetail,
  MeetingParticipantCandidatesResponse,
} from '@workspace/contracts/meetings';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  DiscussionAreaType,
  MeetingInvitationStatus,
  MeetingKind,
  MeetingParticipantRole,
  MeetingStatus,
  UserStatus,
} from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { NotificationService } from '../../notifications/services/notification.service';
import { ProjectAccessService } from '../../projects/services/project-access.service';
import type { CreateAppointmentDto } from '../dto/create-appointment.dto';
import type { CreateQuickCallDto } from '../dto/create-quick-call.dto';
import type { ListMeetingParticipantCandidatesDto } from '../dto/list-meeting-participant-candidates.dto';
import type { RespondMeetingCallDto } from '../dto/respond-meeting-call.dto';
import type { UpdateAppointmentDto } from '../dto/update-appointment.dto';
import {
  meetingDetailInclude,
  meetingSummaryInclude,
  toMeetingDetail,
  toMeetingSummary,
} from '../meetings.mapper';

/** 快速通话固定振铃三十秒。 */
const QUICK_CALL_RING_MILLISECONDS = 30_000;

@Injectable()
export class MeetingCallService {
  /** 注入数据库、项目权限和实时通知服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccessService: ProjectAccessService,
    private readonly notificationService: NotificationService,
  ) {}

  /** 查询全部可受邀的正常系统用户，并排除当前用户。 */
  async listParticipantCandidates(
    authorization: AuthorizationContext,
    query: ListMeetingParticipantCandidatesDto,
  ): Promise<MeetingParticipantCandidatesResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.keyword?.trim();
    const where = {
      id: { not: authorization.userId },
      status: UserStatus.ACTIVE,
      emailVerifiedAt: { not: null },
      department: { is: { status: 'ACTIVE' as const } },
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
              {
                department: {
                  is: {
                    name: { contains: search, mode: 'insensitive' as const },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          department: { select: { name: true } },
        },
        orderBy: [{ name: 'asc' }, { email: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        departmentName: user.department?.name ?? '未分配部门',
      })),
      page,
      pageSize,
      total,
    };
  }

  /** 创建立即进入振铃状态的快速通话。 */
  async createQuickCall(
    authorization: AuthorizationContext,
    dto: CreateQuickCallDto,
  ): Promise<MeetingDetail> {
    const context = await this.validateCreationContext(
      authorization,
      dto.areaId,
      dto.decisionIds,
      dto.participantIds,
    );
    const creator = await this.prisma.user.findUniqueOrThrow({
      where: { id: authorization.userId },
      select: { name: true },
    });
    const now = new Date();
    const ringExpiresAt = new Date(
      now.getTime() + QUICK_CALL_RING_MILLISECONDS,
    );
    const participantIds = [
      ...new Set([authorization.userId, ...dto.participantIds]),
    ];
    const meeting = await this.prisma.meetingSession.create({
      data: {
        areaId: context?.areaId ?? null,
        createdById: authorization.userId,
        title: dto.title ?? `${creator.name ?? '成员'}发起的快速通话`,
        kind: MeetingKind.QUICK_CALL,
        mediaMode: dto.mediaMode,
        status: MeetingStatus.LIVE,
        startedAt: now,
        ringExpiresAt,
        scheduledDurationMinutes: null,
        participants: {
          createMany: {
            data: participantIds.map((userId) => ({
              userId,
              role:
                userId === authorization.userId
                  ? MeetingParticipantRole.HOST
                  : MeetingParticipantRole.ATTENDEE,
              invitationStatus:
                userId === authorization.userId
                  ? MeetingInvitationStatus.ACCEPTED
                  : MeetingInvitationStatus.INVITED,
              respondedAt: userId === authorization.userId ? now : null,
            })),
          },
        },
        ...(dto.decisionIds.length > 0
          ? {
              decisionLinks: {
                createMany: {
                  data: dto.decisionIds.map((decisionId) => ({ decisionId })),
                },
              },
            }
          : {}),
      },
      include: meetingDetailInclude,
    });

    this.notificationService.notifyMeetingIncomingCall({
      recipientIds: dto.participantIds,
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      actor: { id: authorization.userId, name: creator.name ?? '会议发起人' },
      occurredAt: now,
      expiresAt: ringExpiresAt,
      mediaMode: dto.mediaMode,
    });
    return toMeetingDetail(meeting);
  }

  /** 创建可提前三十分钟进入的预约会议。 */
  async createAppointment(
    authorization: AuthorizationContext,
    dto: CreateAppointmentDto,
  ): Promise<MeetingDetail> {
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt <= new Date()) {
      this.throwInvalidTransition('预约开始时间必须晚于当前时间');
    }
    const context = await this.validateCreationContext(
      authorization,
      dto.areaId,
      dto.decisionIds,
      dto.participantIds,
    );
    const now = new Date();
    const participantIds = [
      ...new Set([authorization.userId, ...dto.participantIds]),
    ];
    const meeting = await this.prisma.meetingSession.create({
      data: {
        areaId: context?.areaId ?? null,
        createdById: authorization.userId,
        title: dto.title,
        description: dto.description,
        kind: MeetingKind.APPOINTMENT,
        mediaMode: dto.mediaMode,
        status: MeetingStatus.SCHEDULED,
        scheduledAt,
        scheduledDurationMinutes: dto.scheduledDurationMinutes,
        participants: {
          createMany: {
            data: participantIds.map((userId) => ({
              userId,
              role:
                userId === authorization.userId
                  ? MeetingParticipantRole.HOST
                  : MeetingParticipantRole.ATTENDEE,
              invitationStatus:
                userId === authorization.userId
                  ? MeetingInvitationStatus.ACCEPTED
                  : MeetingInvitationStatus.INVITED,
              respondedAt: userId === authorization.userId ? now : null,
            })),
          },
        },
        ...(dto.decisionIds.length > 0
          ? {
              decisionLinks: {
                createMany: {
                  data: dto.decisionIds.map((decisionId) => ({ decisionId })),
                },
              },
            }
          : {}),
      },
      include: meetingDetailInclude,
    });

    this.notificationService.notifyMeetingInvited({
      recipientIds: dto.participantIds,
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      actor: {
        id: authorization.userId,
        name: meeting.createdBy.name ?? '会议主持人',
      },
      occurredAt: meeting.createdAt,
    });
    return toMeetingDetail(meeting);
  }

  /** 修改主持人创建且尚未开始的预约会议。 */
  async updateAppointment(
    authorization: AuthorizationContext,
    meetingId: number,
    dto: UpdateAppointmentDto,
  ): Promise<MeetingDetail> {
    const meeting = await this.findParticipantMeeting(authorization, meetingId);
    this.assertHost(authorization, meeting.participants);
    if (
      meeting.kind !== MeetingKind.APPOINTMENT ||
      meeting.status !== MeetingStatus.SCHEDULED
    ) {
      this.throwInvalidTransition('只有尚未开始的预约会议可以修改');
    }
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : undefined;
    if (scheduledAt && scheduledAt <= new Date()) {
      this.throwInvalidTransition('预约开始时间必须晚于当前时间');
    }
    const updated = await this.prisma.meetingSession.update({
      where: { id: meetingId },
      data: {
        ...dto,
        ...(scheduledAt ? { scheduledAt } : {}),
      },
      include: meetingDetailInclude,
    });
    this.notificationService.notifyMeetingUpdated({
      recipientIds: updated.participants
        .filter(
          (participant) =>
            participant.invitationStatus !== MeetingInvitationStatus.DECLINED,
        )
        .map((participant) => participant.userId)
        .filter((userId) => userId !== authorization.userId),
      meetingId: updated.id,
      meetingTitle: updated.title,
      occurredAt: updated.updatedAt,
    });
    return toMeetingDetail(updated);
  }

  /** 主持人主动取消尚未开始的预约会议。 */
  async cancelAppointment(
    authorization: AuthorizationContext,
    meetingId: number,
  ): Promise<MeetingDetail> {
    const meeting = await this.findParticipantMeeting(authorization, meetingId);
    this.assertHost(authorization, meeting.participants);
    if (
      meeting.kind !== MeetingKind.APPOINTMENT ||
      meeting.status !== MeetingStatus.SCHEDULED
    ) {
      this.throwInvalidTransition('只有尚未开始的预约会议可以取消');
    }
    const endedAt = new Date();
    const updated = await this.prisma.meetingSession.update({
      where: { id: meetingId },
      data: { status: MeetingStatus.CANCELLED, endedAt },
      include: meetingDetailInclude,
    });
    this.notificationService.notifyMeetingCancelled({
      recipientIds: updated.participants
        .filter(
          (participant) =>
            participant.invitationStatus !== MeetingInvitationStatus.DECLINED,
        )
        .map((participant) => participant.userId)
        .filter((userId) => userId !== authorization.userId),
      meetingId: updated.id,
      meetingTitle: updated.title,
      occurredAt: endedAt,
    });
    return toMeetingDetail(updated);
  }

  /** 查询当前用户三十秒振铃窗口内尚未处理的快速来电。 */
  async listIncomingCalls(
    authorization: AuthorizationContext,
  ): Promise<IncomingMeetingCallsResponse> {
    const now = new Date();
    const meetings = await this.prisma.meetingSession.findMany({
      where: {
        kind: MeetingKind.QUICK_CALL,
        status: MeetingStatus.LIVE,
        ringExpiresAt: { gt: now },
        participants: {
          some: {
            userId: authorization.userId,
            invitationStatus: MeetingInvitationStatus.INVITED,
          },
        },
      },
      include: {
        ...meetingSummaryInclude,
        participants: {
          where: { userId: authorization.userId },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: [{ ringExpiresAt: 'asc' }, { id: 'asc' }],
    });
    return meetings.map((meeting) => ({
      ...toMeetingSummary(meeting),
      participantId: meeting.participants[0].id,
    }));
  }

  /** 原子记录当前用户对快速通话的接听或拒绝。 */
  async respondToCall(
    authorization: AuthorizationContext,
    meetingId: number,
    dto: RespondMeetingCallDto,
  ): Promise<MeetingDetail> {
    const now = new Date();
    const meeting = await this.findParticipantMeeting(authorization, meetingId);
    if (
      meeting.kind !== MeetingKind.QUICK_CALL ||
      meeting.status !== MeetingStatus.LIVE ||
      !meeting.ringExpiresAt ||
      meeting.ringExpiresAt <= now
    ) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_CALL_EXPIRED,
        message: '本次快速通话已经停止振铃',
        status: 409,
      });
    }
    const invitationStatus =
      dto.response === 'ACCEPT'
        ? MeetingInvitationStatus.ACCEPTED
        : MeetingInvitationStatus.DECLINED;
    const result = await this.prisma.meetingParticipant.updateMany({
      where: {
        meetingId,
        userId: authorization.userId,
        invitationStatus: MeetingInvitationStatus.INVITED,
      },
      data: { invitationStatus, respondedAt: now },
    });
    if (result.count !== 1) {
      this.throwInvalidTransition('当前来电已经响应，请勿重复操作');
    }
    const updated = await this.prisma.meetingSession.findUniqueOrThrow({
      where: { id: meetingId },
      include: meetingDetailInclude,
    });
    return toMeetingDetail(updated);
  }

  /** 校验可选项目上下文和全部受邀成员。 */
  private async validateCreationContext(
    authorization: AuthorizationContext,
    areaId: number | undefined,
    decisionIds: number[],
    invitedParticipantIds: number[],
  ): Promise<{ areaId: number } | null> {
    const participantIds = [
      ...new Set([authorization.userId, ...invitedParticipantIds]),
    ];
    if (!areaId) {
      if (decisionIds.length > 0) {
        throw new BusinessException({
          code: API_ERROR_CODES.MEETING_DECISION_INVALID,
          message: '独立会议不能关联项目决策',
          status: 400,
        });
      }
      await this.assertActiveUsers(participantIds);
      return null;
    }
    const areaRecord = await this.prisma.discussionArea.findUnique({
      where: { id: areaId },
      select: { projectId: true },
    });
    if (!areaRecord) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_CREATE_NOT_ALLOWED,
        message: '会议分区不存在或当前用户无权访问',
        status: 404,
      });
    }
    const area = await this.projectAccessService.findArea(
      authorization,
      areaRecord.projectId,
      areaId,
    );
    this.projectAccessService.assertAreaMeetingManager(area);
    this.projectAccessService.assertAreaWritable(area);
    const [decisionCount, participantCount] = await Promise.all([
      decisionIds.length === 0
        ? Promise.resolve(0)
        : this.prisma.decision.count({
            where: {
              id: { in: decisionIds },
              projectId: areaRecord.projectId,
              OR: [{ areaId: null }, { areaId }],
            },
          }),
      area.type === DiscussionAreaType.PUBLIC
        ? this.prisma.projectMember.count({
            where: {
              projectId: areaRecord.projectId,
              userId: { in: participantIds },
            },
          })
        : this.prisma.discussionAreaMember.count({
            where: { areaId, userId: { in: participantIds } },
          }),
    ]);
    if (decisionCount !== decisionIds.length) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_DECISION_INVALID,
        message: '会议只能关联当前项目或分区中的决策',
        status: 400,
      });
    }
    if (participantCount !== participantIds.length) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_PARTICIPANT_INVALID,
        message: '受邀人不在当前项目分区的可见成员范围内',
        status: 400,
      });
    }
    return { areaId };
  }

  /** 校验独立会议受邀人全部为可用账号。 */
  private async assertActiveUsers(userIds: number[]): Promise<void> {
    const count = await this.prisma.user.count({
      where: {
        id: { in: userIds },
        status: UserStatus.ACTIVE,
        emailVerifiedAt: { not: null },
      },
    });
    if (count !== userIds.length) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_PARTICIPANT_INVALID,
        message: '受邀人不存在或账号当前不可用',
        status: 400,
      });
    }
  }

  /** 查询当前用户确实受邀的会议详情。 */
  private async findParticipantMeeting(
    authorization: AuthorizationContext,
    meetingId: number,
  ) {
    const meeting = await this.prisma.meetingSession.findFirst({
      where: {
        id: meetingId,
        participants: { some: { userId: authorization.userId } },
      },
      include: meetingDetailInclude,
    });
    if (!meeting) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_NOT_FOUND,
        message: '会议不存在或当前用户未受邀',
        status: 404,
      });
    }
    return meeting;
  }

  /** 断言当前用户为会议主持人或联合主持人。 */
  private assertHost(
    authorization: AuthorizationContext,
    participants: Array<{ userId: number; role: MeetingParticipantRole }>,
  ): void {
    const allowed = participants.some(
      (participant) =>
        participant.userId === authorization.userId &&
        (participant.role === MeetingParticipantRole.HOST ||
          participant.role === MeetingParticipantRole.CO_HOST),
    );
    if (!allowed) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
        message: '只有会议主持人可以执行此操作',
        status: 403,
      });
    }
  }

  /** 抛出稳定的会议状态冲突。 */
  private throwInvalidTransition(message: string): never {
    throw new BusinessException({
      code: API_ERROR_CODES.MEETING_INVALID_STATUS_TRANSITION,
      message,
      status: 409,
    });
  }
}
