/**
 * 本文件统一校验写入消息、提案、投票和决议时携带的可选会议上下文。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import { MeetingStatus, type Prisma } from '../../../generated/prisma';

/** 会议上下文校验所需的最小数据库能力，兼容 PrismaService 与事务客户端。 */
type MeetingContextDatabaseClient = Pick<
  Prisma.TransactionClient,
  'meetingSession'
>;

@Injectable()
export class MeetingContextService {
  /** 注入数据库服务，非事务调用默认使用全局客户端。 */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 校验可选会议属于当前决策且处于进行中，并返回可直接持久化的会议主键。
   */
  async resolveWritableMeetingId(
    decisionId: number,
    meetingId: number | undefined,
    client: MeetingContextDatabaseClient = this.prisma,
  ): Promise<number | null> {
    if (meetingId === undefined) {
      return null;
    }

    const meeting = await client.meetingSession.findFirst({
      where: {
        id: meetingId,
        space: { decision: { is: { id: decisionId } } },
      },
      select: { id: true, status: true },
    });

    if (!meeting) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_NOT_FOUND,
        message: '会议不存在或不属于当前决策',
        status: 404,
      });
    }

    if (meeting.status !== MeetingStatus.LIVE) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_INVALID_STATUS_TRANSITION,
        message: '只有进行中的会议可以写入会议内容',
        status: 409,
      });
    }

    return meeting.id;
  }
}
