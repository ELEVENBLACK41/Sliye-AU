/*
 * @Description: 最小决策业务服务，负责数据范围过滤、创建事务与详情防越权。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type {
  DecisionDetail,
  DecisionEventTimelineItem,
  DecisionSummary,
} from '@workspace/contracts/decisions';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import { DecisionEventType, ParticipantRole } from '../../generated/prisma';
import type { AuthorizationContext } from '../auth/types/auth.types';
import { AuthorizationService } from '../auth/services/authorization.service';
import { CreateDecisionDto } from './dto/create-decision.dto';
import {
  toDecisionDetail,
  toDecisionEvent,
  toDecisionSummary,
} from './decisions.mapper';

/** 决策查询统一加载的列表关系。 */
const decisionSummaryInclude = {
  department: true,
  creator: {
    select: { id: true, name: true, avatarUrl: true },
  },
  owner: {
    select: { id: true, name: true, avatarUrl: true },
  },
  _count: {
    select: { participants: true },
  },
} as const;

@Injectable()
export class DecisionsService {
  /** 注入数据库与统一授权服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** 返回经过数据范围裁剪的决策列表。 */
  async list(authorization: AuthorizationContext): Promise<DecisionSummary[]> {
    const where = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const decisions = await this.prisma.decision.findMany({
      where,
      include: decisionSummaryInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });

    return decisions.map(toDecisionSummary);
  }

  /** 查询单个可访问决策，越权与不存在统一返回 404。 */
  async get(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<DecisionDetail> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const decision = await this.prisma.decision.findFirst({
      where: {
        AND: [{ id: decisionId }, scopeWhere],
      },
      include: {
        ...decisionSummaryInclude,
        participants: {
          include: {
            user: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
          orderBy: { createdAt: 'asc' },
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

    return toDecisionDetail(decision);
  }

  /** 查询单个可访问决策的完整事件时间线。 */
  async listEvents(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<DecisionEventTimelineItem[]> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const decision = await this.prisma.decision.findFirst({
      where: {
        AND: [{ id: decisionId }, scopeWhere],
      },
      select: {
        events: {
          include: {
            actor: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
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

    return decision.events.map(toDecisionEvent);
  }

  /** 在授权部门内创建决策，并原子写入创建人和时间线事件。 */
  async create(
    authorization: AuthorizationContext,
    dto: CreateDecisionDto,
  ): Promise<DecisionDetail> {
    await this.authorizationService.assertDepartmentInScope(
      authorization,
      'decision:create',
      dto.departmentId,
    );

    const decision = await this.prisma.$transaction(async (tx) =>
      tx.decision.create({
        data: {
          title: dto.title,
          description: dto.description,
          deptId: dto.departmentId,
          creatorId: authorization.userId,
          ownerId: authorization.userId,
          participants: {
            create: {
              userId: authorization.userId,
              role: ParticipantRole.OWNER,
            },
          },
          events: {
            create: {
              actorId: authorization.userId,
              type: DecisionEventType.DECISION_CREATED,
              title: '创建决策',
              payload: {
                departmentId: dto.departmentId,
              },
            },
          },
        },
        include: {
          ...decisionSummaryInclude,
          participants: {
            include: {
              user: {
                select: { id: true, name: true, avatarUrl: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
    );

    return toDecisionDetail(decision);
  }
}
