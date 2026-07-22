/**
 * 本文件负责决策群聊消息的可见范围、游标分页、幂等发送和回复目标校验。
 */
import { Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client-runtime-utils';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type {
  DecisionChatMessage,
  DecisionChatMessagePage,
} from '@workspace/contracts/decisions';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  DecisionStatus,
  DiscussionSpaceStatus,
} from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { toDecisionChatMessage } from '../decisions.mapper';
import { CreateDecisionChatMessageDto } from '../dto/create-decision-chat-message.dto';
import { ListDecisionChatMessagesDto } from '../dto/list-decision-chat-messages.dto';
import type { DecisionChatMessageRecord } from '../types/decision-mapper.types';

/** 未指定分页数量时使用的默认消息条数。 */
const DEFAULT_PAGE_LIMIT = 30;

/** 群聊消息及其发送人和一级回复摘要的统一查询关系。 */
const decisionChatMessageInclude = {
  author: {
    select: { id: true, name: true, avatarUrl: true },
  },
  replyTo: {
    include: {
      author: {
        select: { id: true, name: true, avatarUrl: true },
      },
    },
  },
} as const;

/** 查询群聊前完成数据范围校验后返回的决策上下文。 */
type DecisionChatContext = {
  /** 决策主键。 */
  id: number;
  /** 决策当前生命周期状态。 */
  status: DecisionStatus;
  /** 决策唯一讨论空间主键。 */
  spaceId: number;
  /** 决策唯一讨论空间状态。 */
  space: { status: DiscussionSpaceStatus };
  /** 当前用户在决策中的参与关系；空数组表示仅拥有数据范围读取权限。 */
  participants: { id: number }[];
};

@Injectable()
export class DecisionChatService {
  /** 注入数据库与统一授权服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** 查询可见决策的消息，并始终按消息主键正序返回。 */
  async list(
    authorization: AuthorizationContext,
    decisionId: number,
    query: ListDecisionChatMessagesDto,
  ): Promise<DecisionChatMessagePage> {
    const decision = await this.findVisibleDecision(authorization, decisionId);
    const direction = query.direction ?? 'before';
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const isLatestAfterQuery =
      direction === 'after' && query.cursor === undefined;
    const shouldQueryDescending = direction === 'before' || isLatestAfterQuery;
    const messages = await this.prisma.discussionMessage.findMany({
      where: {
        spaceId: decision.spaceId,
        ...(query.cursor
          ? {
              id:
                direction === 'before'
                  ? { lt: query.cursor }
                  : { gt: query.cursor },
            }
          : {}),
      },
      include: decisionChatMessageInclude,
      orderBy: { id: shouldQueryDescending ? 'desc' : 'asc' },
      take: limit + (isLatestAfterQuery ? 0 : 1),
    });
    const hasMore = isLatestAfterQuery ? false : messages.length > limit;
    const pageRecords = messages.slice(0, limit);

    if (shouldQueryDescending) {
      pageRecords.reverse();
    }

    const items = pageRecords.map(toDecisionChatMessage);
    const nextCursor = hasMore
      ? direction === 'before'
        ? (items[0]?.id ?? null)
        : (items.at(-1)?.id ?? null)
      : null;

    return { items, nextCursor, hasMore };
  }

  /** 幂等创建一条文字消息，重复请求返回原消息而不重复落库。 */
  async create(
    authorization: AuthorizationContext,
    decisionId: number,
    dto: CreateDecisionChatMessageDto,
  ): Promise<DecisionChatMessage> {
    const decision = await this.findVisibleDecision(authorization, decisionId);

    this.assertParticipant(decision);

    const existingMessage = await this.findIdempotentMessage(
      authorization.userId,
      dto.clientMessageId,
    );

    if (existingMessage) {
      return this.resolveIdempotentMessage(
        existingMessage,
        decision.spaceId,
        dto,
      );
    }

    this.assertWritable(decision);
    await this.assertReplyTarget(decision.spaceId, dto.replyToId);

    try {
      const message = await this.prisma.discussionMessage.create({
        data: {
          spaceId: decision.spaceId,
          authorId: authorization.userId,
          clientMessageId: dto.clientMessageId,
          content: dto.content,
          replyToId: dto.replyToId,
        },
        include: decisionChatMessageInclude,
      });

      return toDecisionChatMessage(message);
    } catch (error) {
      if (
        !(error instanceof PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }

      const concurrentMessage = await this.findIdempotentMessage(
        authorization.userId,
        dto.clientMessageId,
      );

      if (!concurrentMessage) {
        throw error;
      }

      return this.resolveIdempotentMessage(
        concurrentMessage,
        decision.spaceId,
        dto,
      );
    }
  }

  /** 按 `decision:read` 数据范围查询决策，越权和不存在统一返回 404。 */
  private async findVisibleDecision(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<DecisionChatContext> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const decision = await this.prisma.decision.findFirst({
      where: {
        AND: [{ id: decisionId }, scopeWhere],
      },
      select: {
        id: true,
        status: true,
        spaceId: true,
        space: {
          select: { status: true },
        },
        participants: {
          where: { userId: authorization.userId },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!decision) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_NOT_FOUND,
        message: '决策不存在或当前账号无权访问',
        status: 404,
      });
    }

    return decision;
  }

  /** 断言当前用户是决策参与者；参与角色不限制发言。 */
  private assertParticipant(decision: DecisionChatContext): void {
    if (decision.participants.length === 0) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_CHAT_SEND_NOT_ALLOWED,
        message: '当前账号不是决策参与者，只能查看群聊历史',
        status: 403,
      });
    }
  }

  /** 断言决策和群组都处于允许新增消息的生命周期状态。 */
  private assertWritable(decision: DecisionChatContext): void {
    const decisionWritable =
      decision.status === DecisionStatus.DRAFT ||
      decision.status === DecisionStatus.DISCUSSING;

    if (
      !decisionWritable ||
      decision.space.status !== DiscussionSpaceStatus.ACTIVE
    ) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_CHAT_READ_ONLY,
        message: '决策群组已经结束，历史消息仅供查看',
        status: 409,
      });
    }
  }

  /** 校验一级回复目标存在且属于当前决策的唯一讨论空间。 */
  private async assertReplyTarget(
    spaceId: number,
    replyToId: number | undefined,
  ): Promise<void> {
    if (replyToId === undefined) {
      return;
    }

    const replyTarget = await this.prisma.discussionMessage.findFirst({
      where: { id: replyToId, spaceId },
      select: { id: true },
    });

    if (!replyTarget) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_CHAT_MESSAGE_NOT_FOUND,
        message: '回复的消息不存在或不属于当前决策群组',
        status: 404,
      });
    }
  }

  /** 查询当前用户提交过的同一幂等键消息。 */
  private findIdempotentMessage(
    authorId: number,
    clientMessageId: string,
  ): Promise<DecisionChatMessageRecord | null> {
    return this.prisma.discussionMessage.findFirst({
      where: { authorId, clientMessageId },
      include: decisionChatMessageInclude,
    });
  }

  /** 校验重复请求载荷与原消息一致，一致时返回原消息。 */
  private resolveIdempotentMessage(
    message: DecisionChatMessageRecord,
    spaceId: number,
    dto: CreateDecisionChatMessageDto,
  ): DecisionChatMessage {
    const requestedReplyToId = dto.replyToId ?? null;
    const matchesOriginalRequest =
      message.spaceId === spaceId &&
      message.content === dto.content &&
      message.replyToId === requestedReplyToId;

    if (!matchesOriginalRequest) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_CHAT_IDEMPOTENCY_CONFLICT,
        message: '同一消息幂等标识不能用于不同的消息内容或回复目标',
        status: 409,
      });
    }

    return toDecisionChatMessage(message);
  }
}
