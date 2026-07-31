/**
 * 本文件负责分区消息可见性、分页、幂等发送和业务关联校验。
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client-runtime-utils';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type {
  ProjectChatMessage,
  ProjectChatMessagePage,
  ProjectChatTicket,
} from '@workspace/contracts/projects';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  ProjectMemberRole,
  MeetingStatus,
  type Prisma,
} from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { CreateProjectChatMessageDto } from '../dto/create-project-chat-message.dto';
import { ListProjectChatMessagesDto } from '../dto/list-project-chat-messages.dto';
import { ProjectChatGateway } from '../gateways/project-chat.gateway';
import {
  toProjectChatMessage,
  type ProjectChatMessageRecord,
} from '../projects.mapper';
import {
  ProjectAccessService,
  type DiscussionAreaAccessContext,
} from './project-access.service';
import { ProjectChatTicketService } from './project-chat-ticket.service';

/** 未指定分页数量时使用的默认消息条数。 */
const DEFAULT_PAGE_LIMIT = 30;

/** 分区消息响应统一加载的安全关联。 */
export const projectChatMessageInclude = {
  area: { select: { projectId: true } },
  author: { select: { id: true, name: true, avatarUrl: true } },
  replyTo: {
    include: {
      author: { select: { id: true, name: true, avatarUrl: true } },
    },
  },
  decision: { select: { id: true, title: true } },
} as const satisfies Prisma.DiscussionMessageInclude;

@Injectable()
export class ProjectChatService {
  private readonly logger = new Logger(ProjectChatService.name);

  /** 注入数据库、分区授权、Ticket 与实时广播服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: ProjectAccessService,
    private readonly ticketService: ProjectChatTicketService,
    private readonly gateway: ProjectChatGateway,
  ) {}

  /** 为当前登录会话签发只绑定指定项目分区的短期 Ticket。 */
  async issueTicket(
    authorization: AuthorizationContext,
    sessionId: string,
    projectId: number,
    areaId: number,
  ): Promise<ProjectChatTicket> {
    await this.accessService.findArea(authorization, projectId, areaId);
    return this.ticketService.issue({
      userId: authorization.userId,
      sessionId,
      projectId,
      areaId,
    });
  }

  /** 查询当前用户可见分区的消息并始终按主键正序返回。 */
  async list(
    authorization: AuthorizationContext,
    projectId: number,
    areaId: number,
    query: ListProjectChatMessagesDto,
  ): Promise<ProjectChatMessagePage> {
    await this.accessService.findArea(authorization, projectId, areaId);
    await this.assertOptionalFilters(projectId, areaId, query);
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
      include: projectChatMessageInclude,
      orderBy: { id: descending ? 'desc' : 'asc' },
      take: limit + (isLatestAfterQuery ? 0 : 1),
    });
    const hasMore = isLatestAfterQuery ? false : messages.length > limit;
    const records = messages.slice(0, limit);
    if (descending) {
      records.reverse();
    }

    const items = records.map((message) =>
      toProjectChatMessage(message as ProjectChatMessageRecord),
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
    projectId: number,
    areaId: number,
    dto: CreateProjectChatMessageDto,
  ): Promise<ProjectChatMessage> {
    const area = await this.accessService.findArea(
      authorization,
      projectId,
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
      this.assertDecisionInArea(projectId, areaId, dto.decisionId),
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
        include: projectChatMessageInclude,
      });
      const result = toProjectChatMessage(message);
      this.broadcastCreatedMessage(projectId, areaId, result);
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

  /** 断言当前项目角色允许发送分区消息。 */
  private assertCanSend(area: DiscussionAreaAccessContext): void {
    if (area.projectMemberRole === ProjectMemberRole.VIEWER) {
      throw new BusinessException({
        code: API_ERROR_CODES.PROJECT_CHAT_SEND_NOT_ALLOWED,
        message: '当前账号在项目中只有查看权限',
        status: 403,
      });
    }
  }

  /** 校验消息关联的是项目级决策或当前分区自己的小组决策。 */
  private async assertDecisionInArea(
    projectId: number,
    areaId: number,
    decisionId: number | undefined,
  ): Promise<void> {
    if (decisionId === undefined) {
      return;
    }
    const decision = await this.prisma.decision.findFirst({
      where: {
        id: decisionId,
        projectId,
        OR: [{ areaId: null }, { areaId }],
      },
      select: { id: true },
    });
    if (!decision) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_NOT_FOUND,
        message: '关联决策不存在或不属于当前讨论分区',
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

  /** 校验列表筛选条件不会跨项目或跨分区。 */
  private async assertOptionalFilters(
    projectId: number,
    areaId: number,
    query: ListProjectChatMessagesDto,
  ): Promise<void> {
    await Promise.all([
      this.assertDecisionInArea(projectId, areaId, query.decisionId),
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
        code: API_ERROR_CODES.PROJECT_CHAT_MESSAGE_NOT_FOUND,
        message: '回复的消息不存在或不属于当前讨论分区',
        status: 404,
      });
    }
  }

  /** 查询当前用户提交过的同一幂等键消息。 */
  private findIdempotentMessage(
    authorId: number,
    clientMessageId: string,
  ): Promise<ProjectChatMessageRecord | null> {
    return this.prisma.discussionMessage.findFirst({
      where: { authorId, clientMessageId },
      include: projectChatMessageInclude,
    });
  }

  /** 校验重复请求载荷与原消息一致，一致时返回原消息。 */
  private resolveIdempotentMessage(
    message: ProjectChatMessageRecord,
    areaId: number,
    dto: CreateProjectChatMessageDto,
  ): ProjectChatMessage {
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
        code: API_ERROR_CODES.PROJECT_CHAT_IDEMPOTENCY_CONFLICT,
        message: '同一消息幂等标识不能用于不同的分区、正文或业务关联',
        status: 409,
      });
    }

    return toProjectChatMessage(message);
  }

  /** 广播失败只记录日志，不能让已经落库的 HTTP 请求伪装为失败。 */
  private broadcastCreatedMessage(
    projectId: number,
    areaId: number,
    message: ProjectChatMessage,
  ): void {
    try {
      this.gateway.broadcastMessageCreated(projectId, areaId, message);
    } catch (error) {
      this.logger.error(
        `Failed to broadcast project chat message ${message.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
