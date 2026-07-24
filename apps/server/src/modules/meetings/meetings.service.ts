/**
 * 本文件负责无音视频会议的创建、列表和详情查询。
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
  DataScope,
  DecisionStatus,
  MeetingParticipantRole,
} from '../../generated/prisma';
import { AuthorizationService } from '../auth/services/authorization.service';
import type { AuthorizationContext } from '../auth/types/auth.types';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import {
  meetingDetailInclude,
  meetingSummaryInclude,
  toMeetingDetail,
  toMeetingSummary,
} from './meetings.mapper';

/** 仍允许创建新会议的决策状态。 */
const meetingCreatableDecisionStatuses = new Set<DecisionStatus>([
  DecisionStatus.DRAFT,
  DecisionStatus.DISCUSSING,
]);

@Injectable()
export class MeetingsService {
  /** 注入数据库和统一授权服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** 在负责人管理的决策中创建计划会议并同步当前决策参与者。 */
  async create(
    authorization: AuthorizationContext,
    decisionId: number,
    dto: CreateMeetingDto,
  ): Promise<MeetingDetail> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:update',
    );
    const decision = await this.prisma.decision.findFirst({
      where: { AND: [{ id: decisionId }, scopeWhere] },
      select: {
        id: true,
        ownerId: true,
        spaceId: true,
        status: true,
        participants: {
          select: { userId: true, role: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!decision) {
      this.throwDecisionNotFound();
    }

    this.assertDecisionManager(
      authorization,
      decision.ownerId,
      '只有决策负责人可以创建会议',
    );

    if (!meetingCreatableDecisionStatuses.has(decision.status)) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_CREATE_NOT_ALLOWED,
        message: '当前决策状态不允许创建会议',
        status: 409,
      });
    }

    const hostUserId = decision.ownerId ?? authorization.userId;
    const participantRoles = new Map<number, MeetingParticipantRole>();

    for (const participant of decision.participants) {
      participantRoles.set(
        participant.userId,
        participant.userId === hostUserId
          ? MeetingParticipantRole.HOST
          : MeetingParticipantRole.ATTENDEE,
      );
    }

    participantRoles.set(hostUserId, MeetingParticipantRole.HOST);

    const meeting = await this.prisma.meetingSession.create({
      data: {
        spaceId: decision.spaceId,
        createdById: authorization.userId,
        title: dto.title,
        description: dto.description,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        participants: {
          createMany: {
            data: [...participantRoles].map(([userId, role]) => ({
              userId,
              role,
            })),
          },
        },
      },
      include: meetingDetailInclude,
    });

    return toMeetingDetail(meeting);
  }

  /** 查询当前用户可见决策下的全部会议。 */
  async list(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<MeetingListResponse> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const decision = await this.prisma.decision.findFirst({
      where: { AND: [{ id: decisionId }, scopeWhere] },
      select: {
        space: {
          select: {
            meetings: {
              include: meetingSummaryInclude,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            },
          },
        },
      },
    });

    if (!decision) {
      this.throwDecisionNotFound();
    }

    return decision.space.meetings.map(toMeetingSummary);
  }

  /** 查询当前用户授权范围内的一场会议。 */
  async get(
    authorization: AuthorizationContext,
    meetingId: number,
  ): Promise<MeetingDetail> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const meeting = await this.prisma.meetingSession.findFirst({
      where: {
        id: meetingId,
        space: { decision: { is: scopeWhere } },
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

  /** 断言当前用户是决策负责人或拥有全部数据范围。 */
  private assertDecisionManager(
    authorization: AuthorizationContext,
    ownerId: number | null,
    message: string,
  ): void {
    const canManageAll = this.authorizationService
      .getScopes(authorization, 'decision:update')
      .has(DataScope.ALL);

    if (!canManageAll && ownerId !== authorization.userId) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
        message,
        status: 403,
      });
    }
  }

  /** 抛出决策不存在或越权的统一异常。 */
  private throwDecisionNotFound(): never {
    throw new BusinessException({
      code: API_ERROR_CODES.DECISION_NOT_FOUND,
      message: '决策不存在或当前账号无权访问',
      status: 404,
    });
  }
}
