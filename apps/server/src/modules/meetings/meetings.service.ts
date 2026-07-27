/**
 * 本文件负责议事分区会议的创建、可见列表和详情查询。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type {
  MeetingDetail,
  MeetingListResponse,
} from '@workspace/contracts/meetings';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import {
  DiscussionAreaType,
  MeetingParticipantRole,
} from '../../generated/prisma';
import type { AuthorizationContext } from '../auth/types/auth.types';
import { MatterAccessService } from '../matters/services/matter-access.service';
import { NotificationService } from '../notifications/services/notification.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import {
  meetingDetailInclude,
  meetingSummaryInclude,
  toMeetingDetail,
  toMeetingSummary,
} from './meetings.mapper';

@Injectable()
export class MeetingsService {
  /** 注入数据库、统一议事分区授权和全站通知服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly matterAccessService: MatterAccessService,
    private readonly notificationService: NotificationService,
  ) {}

  /** 在当前用户可管理的议事分区中创建会议和多决策关联。 */
  async create(
    authorization: AuthorizationContext,
    matterId: number,
    dto: CreateMeetingDto,
  ): Promise<MeetingDetail> {
    const area = await this.matterAccessService.findArea(
      authorization,
      matterId,
      dto.areaId,
    );
    this.matterAccessService.assertAreaMeetingManager(area);
    this.matterAccessService.assertAreaWritable(area);

    await Promise.all([
      this.assertDecisionsInArea(matterId, dto.areaId, dto.decisionIds),
      this.assertParticipantsVisible(matterId, dto.areaId, area.type, [
        ...new Set([authorization.userId, ...dto.participantIds]),
      ]),
    ]);

    const participantIds = [
      ...new Set([authorization.userId, ...dto.participantIds]),
    ];
    const meeting = await this.prisma.meetingSession.create({
      data: {
        areaId: dto.areaId,
        createdById: authorization.userId,
        title: dto.title,
        description: dto.description,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        participants: {
          createMany: {
            data: participantIds.map((userId) => ({
              userId,
              role:
                userId === authorization.userId
                  ? MeetingParticipantRole.HOST
                  : MeetingParticipantRole.ATTENDEE,
            })),
          },
        },
        ...(dto.decisionIds.length === 0
          ? {}
          : {
              decisionLinks: {
                createMany: {
                  data: dto.decisionIds.map((decisionId) => ({ decisionId })),
                },
              },
            }),
      },
      include: meetingDetailInclude,
    });

    this.notificationService.notifyMeetingInvited({
      recipientIds: participantIds.filter(
        (userId) => userId !== authorization.userId,
      ),
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      actor: {
        id: meeting.createdBy.id,
        name: meeting.createdBy.name ?? '会议主持人',
      },
      occurredAt: meeting.createdAt,
    });

    return toMeetingDetail(meeting);
  }

  /** 查询一项议事下当前用户可见分区中的全部会议。 */
  async list(
    authorization: AuthorizationContext,
    matterId: number,
  ): Promise<MeetingListResponse> {
    await this.matterAccessService.findMatter(authorization, matterId);
    const meetings = await this.prisma.meetingSession.findMany({
      where: {
        area: this.matterAccessService.buildVisibleAreaWhere(
          authorization.userId,
          matterId,
        ),
      },
      include: meetingSummaryInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return meetings.map(toMeetingSummary);
  }

  /** 查询当前用户通过所在分区可见的一场会议。 */
  async get(
    authorization: AuthorizationContext,
    meetingId: number,
  ): Promise<MeetingDetail> {
    const meeting = await this.prisma.meetingSession.findFirst({
      where: {
        id: meetingId,
        area: this.matterAccessService.buildVisibleAreaWhere(
          authorization.userId,
        ),
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

    return toMeetingDetail(meeting);
  }

  /** 校验会议只关联议事级决策或当前分区自己的小组决策。 */
  private async assertDecisionsInArea(
    matterId: number,
    areaId: number,
    decisionIds: number[],
  ): Promise<void> {
    if (decisionIds.length === 0) {
      return;
    }
    const count = await this.prisma.decision.count({
      where: {
        id: { in: decisionIds },
        matterId,
        OR: [{ areaId: null }, { areaId }],
      },
    });
    if (count !== decisionIds.length) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_DECISION_INVALID,
        message: '会议只能关联议事级决策或当前分区的小组决策',
        status: 400,
      });
    }
  }

  /** 校验受邀用户全部位于公共区或私有区的可见成员集合。 */
  private async assertParticipantsVisible(
    matterId: number,
    areaId: number,
    areaType: DiscussionAreaType,
    participantIds: number[],
  ): Promise<void> {
    const count =
      areaType === DiscussionAreaType.PUBLIC
        ? await this.prisma.matterMember.count({
            where: { matterId, userId: { in: participantIds } },
          })
        : await this.prisma.discussionAreaMember.count({
            where: { areaId, userId: { in: participantIds } },
          });
    if (count !== participantIds.length) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_PARTICIPANT_INVALID,
        message:
          areaType === DiscussionAreaType.PUBLIC
            ? '公共会议只能邀请当前议事成员'
            : '私有会议只能邀请当前私有分区成员',
        status: 400,
      });
    }
  }
}
