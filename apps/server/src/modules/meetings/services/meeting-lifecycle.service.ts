/**
 * 本文件负责无音视频会议的开始、结束、主持权限和生命周期事件。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { MeetingDetail } from '@workspace/contracts/meetings';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  DataScope,
  DecisionEventType,
  DecisionStatus,
  MeetingParticipantRole,
  MeetingStatus,
  type Prisma,
} from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import {
  meetingDetailInclude,
  toMeetingDetail,
  type MeetingDetailRecord,
} from '../meetings.mapper';

@Injectable()
export class MeetingLifecycleService {
  /** 注入数据库和统一授权服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** 开始一场计划会议，并原子写入会议开始事件。 */
  async start(
    authorization: AuthorizationContext,
    meetingId: number,
  ): Promise<MeetingDetail> {
    const meeting = await this.findAccessibleMeeting(authorization, meetingId);
    const decision = meeting.space.decision!;

    this.assertMeetingManager(
      authorization,
      meeting,
      '只有会议主持人可以开始会议',
    );

    if (decision.status !== DecisionStatus.DISCUSSING) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_INVALID_STATUS_TRANSITION,
        message: '决策进入讨论阶段后才能开始会议',
        status: 409,
      });
    }

    if (meeting.status !== MeetingStatus.SCHEDULED) {
      this.throwInvalidMeetingTransition('当前会议状态不能开始会议');
    }

    const updatedMeeting = await this.prisma.$transaction(async (tx) => {
      await this.lockDecision(tx, decision.id);

      const liveMeetingCount = await tx.meetingSession.count({
        where: {
          spaceId: meeting.spaceId,
          status: MeetingStatus.LIVE,
          id: { not: meeting.id },
        },
      });

      if (liveMeetingCount > 0) {
        throw new BusinessException({
          code: API_ERROR_CODES.MEETING_LIVE_CONFLICT,
          message: '当前决策已经有一场进行中的会议',
          status: 409,
        });
      }

      const startedAt = new Date();
      const updateResult = await tx.meetingSession.updateMany({
        where: { id: meeting.id, status: MeetingStatus.SCHEDULED },
        data: { status: MeetingStatus.LIVE, startedAt },
      });

      if (updateResult.count !== 1) {
        this.throwInvalidMeetingTransition('会议状态已经变化，请刷新后重试');
      }

      await tx.decisionEvent.create({
        data: {
          decisionId: decision.id,
          meetingId: meeting.id,
          actorId: authorization.userId,
          type: DecisionEventType.MEETING_STARTED,
          title: '开始会议',
          payload: { meetingTitle: meeting.title },
          before: { status: MeetingStatus.SCHEDULED },
          after: {
            status: MeetingStatus.LIVE,
            startedAt: startedAt.toISOString(),
          },
        },
      });

      return this.findMeetingInTransaction(tx, meeting.id);
    });

    return toMeetingDetail(updatedMeeting);
  }

  /** 结束一场进行中的会议，并原子写入会议结束事件。 */
  async end(
    authorization: AuthorizationContext,
    meetingId: number,
  ): Promise<MeetingDetail> {
    const meeting = await this.findAccessibleMeeting(authorization, meetingId);
    const decision = meeting.space.decision!;

    this.assertMeetingManager(
      authorization,
      meeting,
      '只有会议主持人可以结束会议',
    );

    if (meeting.status !== MeetingStatus.LIVE) {
      this.throwInvalidMeetingTransition('只有进行中的会议可以结束');
    }

    const updatedMeeting = await this.prisma.$transaction(async (tx) => {
      await this.lockDecision(tx, decision.id);

      const endedAt = new Date();
      const updateResult = await tx.meetingSession.updateMany({
        where: { id: meeting.id, status: MeetingStatus.LIVE },
        data: { status: MeetingStatus.ENDED, endedAt },
      });

      if (updateResult.count !== 1) {
        this.throwInvalidMeetingTransition('会议状态已经变化，请刷新后重试');
      }

      await tx.decisionEvent.create({
        data: {
          decisionId: decision.id,
          meetingId: meeting.id,
          actorId: authorization.userId,
          type: DecisionEventType.MEETING_ENDED,
          title: '结束会议',
          payload: { meetingTitle: meeting.title, reason: 'HOST_ENDED' },
          before: { status: MeetingStatus.LIVE },
          after: {
            status: MeetingStatus.ENDED,
            endedAt: endedAt.toISOString(),
          },
        },
      });

      return this.findMeetingInTransaction(tx, meeting.id);
    });

    return toMeetingDetail(updatedMeeting);
  }

  /** 按决策更新范围查询会议，不向调用方区分越权和不存在。 */
  private async findAccessibleMeeting(
    authorization: AuthorizationContext,
    meetingId: number,
  ): Promise<MeetingDetailRecord> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:update',
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

    return meeting;
  }

  /** 断言当前用户具备负责人、主持人或联合主持人身份。 */
  private assertMeetingManager(
    authorization: AuthorizationContext,
    meeting: MeetingDetailRecord,
    message: string,
  ): void {
    const canManageAll = this.authorizationService
      .getScopes(authorization, 'decision:update')
      .has(DataScope.ALL);
    const isDecisionOwner =
      meeting.space.decision?.ownerId === authorization.userId;
    const isMeetingHost = meeting.participants.some(
      (participant) =>
        participant.userId === authorization.userId &&
        (participant.role === MeetingParticipantRole.HOST ||
          participant.role === MeetingParticipantRole.CO_HOST),
    );

    if (!canManageAll && !isDecisionOwner && !isMeetingHost) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
        message,
        status: 403,
      });
    }
  }

  /** 通过更新决策时间获取同一决策会议生命周期的事务串行锁。 */
  private async lockDecision(
    tx: Prisma.TransactionClient,
    decisionId: number,
  ): Promise<void> {
    await tx.decision.update({
      where: { id: decisionId },
      data: { updatedAt: new Date() },
    });
  }

  /** 在会议事务内读取最终详情，异常时返回稳定服务端错误。 */
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
  private throwInvalidMeetingTransition(message: string): never {
    throw new BusinessException({
      code: API_ERROR_CODES.MEETING_INVALID_STATUS_TRANSITION,
      message,
      status: 409,
    });
  }
}
