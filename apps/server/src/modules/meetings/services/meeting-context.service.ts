/**
 * 本文件统一校验正式提案、投票和决议携带的会议上下文及私有会议参与者完整性。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  DiscussionAreaType,
  MeetingStatus,
  type Prisma,
} from '../../../generated/prisma';

/** 会议上下文校验所需的最小数据库能力。 */
type MeetingContextDatabaseClient = Pick<
  Prisma.TransactionClient,
  'meetingSession' | 'decision'
>;

@Injectable()
export class MeetingContextService {
  /** 注入数据库服务，非事务调用默认使用全局客户端。 */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 校验会议正在进行、已关联目标决策、操作者受邀，并验证私有会议参与者完整性。
   */
  async resolveWritableMeetingId(
    decisionId: number,
    meetingId: number | undefined,
    actorUserId: number,
    client: MeetingContextDatabaseClient = this.prisma,
  ): Promise<number | null> {
    if (meetingId === undefined) {
      return null;
    }

    const meeting = await client.meetingSession.findFirst({
      where: {
        id: meetingId,
        decisionLinks: { some: { decisionId } },
        participants: { some: { userId: actorUserId } },
        area: { project: { decisions: { some: { id: decisionId } } } },
      },
      select: {
        id: true,
        status: true,
        area: {
          select: {
            type: true,
            members: { select: { userId: true } },
          },
        },
        participants: { select: { userId: true } },
      },
    });
    if (!meeting) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_NOT_FOUND,
        message: '会议不存在、未关联目标决策或当前用户未受邀',
        status: 404,
      });
    }
    if (meeting.status !== MeetingStatus.LIVE) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_INVALID_STATUS_TRANSITION,
        message: '只有进行中的会议可以形成正式决策内容',
        status: 409,
      });
    }

    if (meeting.area.type === DiscussionAreaType.PRIVATE) {
      await this.assertPrivateMeetingComplete(
        decisionId,
        meeting.area.members.map((member) => member.userId),
        meeting.participants.map((participant) => participant.userId),
        client,
      );
    }

    return meeting.id;
  }

  /** 断言目标决策全部参与者同时属于私有分区并已受邀参会。 */
  private async assertPrivateMeetingComplete(
    decisionId: number,
    areaMemberIds: number[],
    meetingParticipantIds: number[],
    client: MeetingContextDatabaseClient,
  ): Promise<void> {
    const decision = await client.decision.findUnique({
      where: { id: decisionId },
      select: { participants: { select: { userId: true } } },
    });
    if (!decision) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_NOT_FOUND,
        message: '目标决策不存在',
        status: 404,
      });
    }

    const areaMembers = new Set(areaMemberIds);
    const meetingParticipants = new Set(meetingParticipantIds);
    const missingUserIds = decision.participants
      .map((participant) => participant.userId)
      .filter(
        (userId) =>
          !areaMembers.has(userId) || !meetingParticipants.has(userId),
      );
    if (missingUserIds.length > 0) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_PRIVATE_DECISION_PARTICIPANTS_INCOMPLETE,
        message: '私有会议缺少目标决策参与者，不能形成正式提案、投票或决议',
        status: 409,
        details: [
          {
            field: 'participantIds',
            message: `缺少用户：${missingUserIds.join('、')}`,
            rule: 'private-meeting-decision-participants-complete',
          },
        ],
      });
    }
  }
}
