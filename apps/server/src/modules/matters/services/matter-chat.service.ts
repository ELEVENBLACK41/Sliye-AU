/**
 * 本文件负责分区消息可见性、分页、幂等发送、业务关联校验和私有摘要发布。
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client-runtime-utils';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type {
  MatterChatMessage,
  MatterChatMessagePage,
  MatterChatTicket,
} from '@workspace/contracts/matters';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  DiscussionAreaMemberRole,
  DiscussionAreaType,
  DiscussionMessageType,
  MatterMemberRole,
  MeetingStatus,
  type Prisma,
} from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { CreateDiscussionPublicationDto } from '../dto/create-discussion-publication.dto';
import { CreateMatterChatMessageDto } from '../dto/create-matter-chat-message.dto';
import { ListMatterChatMessagesDto } from '../dto/list-matter-chat-messages.dto';
import { MatterChatGateway } from '../gateways/matter-chat.gateway';
import {
  toMatterChatMessage,
  type MatterChatMessageRecord,
} from '../matters.mapper';
import {
  MatterAccessService,
  type DiscussionAreaAccessContext,
} from './matter-access.service';
import { MatterChatTicketService } from './matter-chat-ticket.service';

/** 未指定分页数量时使用的默认消息条数。 */
const DEFAULT_PAGE_LIMIT = 30;

/** 分区消息响应统一加载的安全关联。 */
export const matterChatMessageInclude = {
  area: { select: { matterId: true } },
  author: { select: { id: true, name: true, avatarUrl: true } },
  replyTo: {
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
    },
  },
  decision: { select: { id: true, title: true } },
  publishedAs: {
    include: { sourceArea: { select: { name: true } } },
  },
} as const satisfies Prisma.DiscussionMessageInclude;

@Injectable()
export class MatterChatService {
  private readonly logger = new Logger(MatterChatService.name);

  /** 注入数据库、分区授权、Ticket 与实时广播服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: MatterAccessService,
    private readonly ticketService: MatterChatTicketService,
    private readonly gateway: MatterChatGateway,
  ) {}

  /** 为当前登录会话签发只绑定指定议事分区的短期 Ticket。 */
  async issueTicket(
    authorization: AuthorizationContext,
    sessionId: string,
    matterId: number,
    areaId: number,
  ): Promise<MatterChatTicket> {
    await this.accessService.findArea(authorization, matterId, areaId);
    return this.ticketService.issue({
      userId: authorization.userId,
      sessionId,
      matterId,
      areaId,
    });
  }

  /** 查询当前用户可见分区的消息并始终按主键正序返回。 */
  async list(
    authorization: AuthorizationContext,
    matterId: number,
    areaId: number,
    query: ListMatterChatMessagesDto,
  ): Promise<MatterChatMessagePage> {
    await this.accessService.findArea(authorization, matterId, areaId);
    await this.assertOptionalFilters(matterId, areaId, query);
    const direction = query.direction ?? 'before';
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const isLatestAfterQuery =
      direction === 'after' && query.cursor === undefined;
    const descending = direction === 'before' || isLatestAfterQuery;
    const messages = await this.prisma.discussionMessage.findMany({
      where: {
        areaId,
        ...(query.meetingId === undefined
          ? {}
          : { meetingId: query.meetingId }),
        ...(query.decisionId === undefined
          ? {}
          : { decisionId: query.decisionId }),
        ...(query.cursor === undefined
          ? {}
          : {
              id:
                direction === 'before'
                  ? { lt: query.cursor }
                  : { gt: query.cursor },
            }),
      },
      include: matterChatMessageInclude,
      orderBy: { id: descending ? 'desc' : 'asc' },
      take: limit + (isLatestAfterQuery ? 0 : 1),
    });
    const hasMore = isLatestAfterQuery ? false : messages.length > limit;
    const records = messages.slice(0, limit);
    if (descending) {
      records.reverse();
    }

    const items = records.map((message) =>
      toMatterChatMessage(message as MatterChatMessageRecord),
    );
    return {
      items,
      hasMore,
      nextCursor: hasMore
        ? direction === 'before'
          ? (items[0]?.id ?? null)
          : (items.at(-1)?.id ?? null)
        : null,
    };
  }

  /** 幂等创建分区文字消息并广播到唯一分区房间。 */
  async create(
    authorization: AuthorizationContext,
    matterId: number,
    areaId: number,
    dto: CreateMatterChatMessageDto,
  ): Promise<MatterChatMessage> {
    const area = await this.accessService.findArea(
      authorization,
      matterId,
      areaId,
    );
    this.assertCanSend(area);

    const existing = await this.findIdempotentMessage(
      authorization.userId,
      dto.clientMessageId,
    );
    if (existing) {
      return this.resolveIdempotentMessage(existing, areaId, dto);
    }

    this.accessService.assertAreaWritable(area);
    await Promise.all([
      this.assertReplyTarget(areaId, dto.replyToId),
      this.assertDecisionInMatter(matterId, dto.decisionId),
      this.assertMeetingInArea(areaId, dto.meetingId, true),
    ]);

    try {
      const message = await this.prisma.discussionMessage.create({
        data: {
          areaId,
          authorId: authorization.userId,
          clientMessageId: dto.clientMessageId,
          content: dto.content,
          replyToId: dto.replyToId,
          meetingId: dto.meetingId,
          decisionId: dto.decisionId,
        },
        include: matterChatMessageInclude,
      });
      const result = toMatterChatMessage(message);
      this.broadcastCreatedMessage(matterId, areaId, result);
      return result;
    } catch (error) {
      if (
        !(error instanceof PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }

      const concurrent = await this.findIdempotentMessage(
        authorization.userId,
        dto.clientMessageId,
      );
      if (!concurrent) {
        throw error;
      }
      return this.resolveIdempotentMessage(concurrent, areaId, dto);
    }
  }

  /** 将私有分区的选定消息发布为公共区不可变摘要快照。 */
  async publish(
    authorization: AuthorizationContext,
    matterId: number,
    sourceAreaId: number,
    dto: CreateDiscussionPublicationDto,
  ): Promise<MatterChatMessage> {
    const sourceArea = await this.accessService.findArea(
      authorization,
      matterId,
      sourceAreaId,
    );
    this.accessService.assertAreaWritable(sourceArea);
    if (
      sourceArea.type !== DiscussionAreaType.PRIVATE ||
      sourceArea.areaMemberRole !== DiscussionAreaMemberRole.MANAGER
    ) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
        message: '只有私有分区管理员可以发布公共摘要',
        status: 403,
      });
    }

    await this.assertDecisionInMatter(matterId, dto.decisionId);
    const sourceMessages = await this.prisma.discussionMessage.findMany({
      where: { id: { in: dto.sourceMessageIds }, areaId: sourceAreaId },
      select: { id: true },
    });
    if (sourceMessages.length !== dto.sourceMessageIds.length) {
      throw new BusinessException({
        code: API_ERROR_CODES.DISCUSSION_PUBLICATION_SOURCE_INVALID,
        message: '公开摘要引用的消息必须全部来自当前私有分区',
        status: 400,
      });
    }

    const publicArea = await this.prisma.discussionArea.findFirst({
      where: { matterId, type: DiscussionAreaType.PUBLIC },
      select: { id: true },
    });
    if (!publicArea) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_INTERNAL_ERROR,
        message: '当前议事缺少公共讨论区',
        status: 500,
      });
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const publicMessage = await tx.discussionMessage.create({
        data: {
          areaId: publicArea.id,
          authorId: authorization.userId,
          decisionId: dto.decisionId,
          type: DiscussionMessageType.PUBLICATION,
          content: dto.summary,
        },
        select: { id: true },
      });
      await tx.discussionPublication.create({
        data: {
          sourceAreaId,
          targetAreaId: publicArea.id,
          publishedMessageId: publicMessage.id,
          publishedById: authorization.userId,
          decisionId: dto.decisionId,
          title: dto.title,
          sources: {
            createMany: {
              data: dto.sourceMessageIds.map((messageId) => ({ messageId })),
            },
          },
        },
      });

      return tx.discussionMessage.findUnique({
        where: { id: publicMessage.id },
        include: matterChatMessageInclude,
      });
    });
    if (!message) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_INTERNAL_ERROR,
        message: '公开摘要发布失败，请稍后重试',
        status: 500,
      });
    }

    const result = toMatterChatMessage(message);
    this.broadcastCreatedMessage(matterId, publicArea.id, result);
    return result;
  }

  /** 断言当前议事角色允许发送分区消息。 */
  private assertCanSend(area: DiscussionAreaAccessContext): void {
    if (area.matterMemberRole === MatterMemberRole.VIEWER) {
      throw new BusinessException({
        code: API_ERROR_CODES.MATTER_CHAT_SEND_NOT_ALLOWED,
        message: '当前账号在议事中只有查看权限',
        status: 403,
      });
    }
  }

  /** 校验消息关联的决策属于当前议事。 */
  private async assertDecisionInMatter(
    matterId: number,
    decisionId: number | undefined,
  ): Promise<void> {
    if (decisionId === undefined) {
      return;
    }
    const decision = await this.prisma.decision.findFirst({
      where: { id: decisionId, matterId },
      select: { id: true },
    });
    if (!decision) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_NOT_FOUND,
        message: '关联决策不存在或不属于当前议事',
        status: 404,
      });
    }
  }

  /** 校验消息关联的会议属于当前分区，并可选要求会议正在进行。 */
  private async assertMeetingInArea(
    areaId: number,
    meetingId: number | undefined,
    requireLive: boolean,
  ): Promise<void> {
    if (meetingId === undefined) {
      return;
    }
    const meeting = await this.prisma.meetingSession.findFirst({
      where: { id: meetingId, areaId },
      select: { id: true, status: true },
    });
    if (!meeting) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_NOT_FOUND,
        message: '关联会议不存在或不属于当前分区',
        status: 404,
      });
    }
    if (requireLive && meeting.status !== MeetingStatus.LIVE) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_INVALID_STATUS_TRANSITION,
        message: '只有进行中的会议可以写入会议消息',
        status: 409,
      });
    }
  }

  /** 校验列表筛选条件不会跨议事或跨分区。 */
  private async assertOptionalFilters(
    matterId: number,
    areaId: number,
    query: ListMatterChatMessagesDto,
  ): Promise<void> {
    await Promise.all([
      this.assertDecisionInMatter(matterId, query.decisionId),
      this.assertMeetingInArea(areaId, query.meetingId, false),
    ]);
  }

  /** 校验回复目标存在且位于同一讨论分区。 */
  private async assertReplyTarget(
    areaId: number,
    replyToId: number | undefined,
  ): Promise<void> {
    if (replyToId === undefined) {
      return;
    }
    const replyTarget = await this.prisma.discussionMessage.findFirst({
      where: { id: replyToId, areaId },
      select: { id: true },
    });
    if (!replyTarget) {
      throw new BusinessException({
        code: API_ERROR_CODES.MATTER_CHAT_MESSAGE_NOT_FOUND,
        message: '回复的消息不存在或不属于当前讨论分区',
        status: 404,
      });
    }
  }

  /** 查询当前用户提交过的同一幂等键消息。 */
  private findIdempotentMessage(
    authorId: number,
    clientMessageId: string,
  ): Promise<MatterChatMessageRecord | null> {
    return this.prisma.discussionMessage.findFirst({
      where: { authorId, clientMessageId },
      include: matterChatMessageInclude,
    });
  }

  /** 校验重复请求载荷与原消息一致，一致时返回原消息。 */
  private resolveIdempotentMessage(
    message: MatterChatMessageRecord,
    areaId: number,
    dto: CreateMatterChatMessageDto,
  ): MatterChatMessage {
    const matches =
      message.areaId === areaId &&
      message.content === dto.content &&
      message.replyToId === (dto.replyToId ?? null) &&
      message.meetingId === (dto.meetingId ?? null) &&
      message.decision?.id === dto.decisionId;
    const decisionMatches =
      dto.decisionId === undefined
        ? message.decision === null
        : message.decision?.id === dto.decisionId;
    if (!matches || !decisionMatches) {
      throw new BusinessException({
        code: API_ERROR_CODES.MATTER_CHAT_IDEMPOTENCY_CONFLICT,
        message: '同一消息幂等标识不能用于不同的分区、正文或业务关联',
        status: 409,
      });
    }

    return toMatterChatMessage(message);
  }

  /** 广播失败只记录日志，不能让已经落库的 HTTP 请求伪装为失败。 */
  private broadcastCreatedMessage(
    matterId: number,
    areaId: number,
    message: MatterChatMessage,
  ): void {
    try {
      this.gateway.broadcastMessageCreated(matterId, areaId, message);
    } catch (error) {
      this.logger.error(
        `Failed to broadcast matter chat message ${message.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
