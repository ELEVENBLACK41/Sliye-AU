/**
 * 本文件负责决策主记录的创建、查询、详情、时间线读取和生命周期流转。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type {
  DecisionDetail,
  DecisionEventTimelineResponse,
  DecisionListResponse,
} from '@workspace/contracts/decisions';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  DataScope,
  DecisionEventType,
  DecisionStatus,
  ParticipantRole,
} from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { CreateDecisionDto } from '../dto/create-decision.dto';
import { UpdateDecisionStatusDto } from '../dto/update-decision-status.dto';
import {
  toDecisionDetail,
  toDecisionEvent,
  toDecisionSummary,
} from '../decisions.mapper';

/** 决策列表与详情统一加载的基础关系。 */
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
export class DecisionCoreService {
  /** 注入数据库与统一授权服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** 返回经过数据范围裁剪的决策列表。 */
  async list(
    authorization: AuthorizationContext,
  ): Promise<DecisionListResponse> {
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
  ): Promise<DecisionEventTimelineResponse> {
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

  /** 将负责人管理的草稿决策推进到讨论阶段，并原子写入状态变更事件。 */
  async updateStatus(
    authorization: AuthorizationContext,
    decisionId: number,
    dto: UpdateDecisionStatusDto,
  ): Promise<DecisionDetail> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:update',
    );
    const decision = await this.prisma.decision.findFirst({
      where: {
        AND: [{ id: decisionId }, scopeWhere],
      },
      select: { id: true, ownerId: true, status: true },
    });

    if (!decision) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_NOT_FOUND,
        message: '决策不存在或当前账号无权访问',
        status: 404,
      });
    }

    const canManageAll = this.authorizationService
      .getScopes(authorization, 'decision:update')
      .has(DataScope.ALL);

    if (!canManageAll && decision.ownerId !== authorization.userId) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
        message: '只有决策负责人可以开始讨论',
        status: 403,
      });
    }

    if (
      decision.status !== DecisionStatus.DRAFT ||
      dto.status !== DecisionStatus.DISCUSSING
    ) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_INVALID_STATUS_TRANSITION,
        message: '当前决策状态不能进入讨论阶段',
        status: 409,
      });
    }

    const updatedDecision = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.decision.updateMany({
        where: {
          id: decision.id,
          status: DecisionStatus.DRAFT,
        },
        data: { status: DecisionStatus.DISCUSSING },
      });

      if (updateResult.count !== 1) {
        throw new BusinessException({
          code: API_ERROR_CODES.DECISION_INVALID_STATUS_TRANSITION,
          message: '决策状态已经发生变化，请刷新后重试',
          status: 409,
        });
      }

      await tx.decisionEvent.create({
        data: {
          decisionId: decision.id,
          actorId: authorization.userId,
          type: DecisionEventType.STATUS_CHANGED,
          title: '开始讨论',
          before: { status: DecisionStatus.DRAFT },
          after: { status: DecisionStatus.DISCUSSING },
        },
      });

      const result = await tx.decision.findUnique({
        where: { id: decision.id },
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

      if (!result) {
        throw new BusinessException({
          code: API_ERROR_CODES.DECISION_NOT_FOUND,
          message: '决策不存在或当前账号无权访问',
          status: 404,
        });
      }

      return result;
    });

    return toDecisionDetail(updatedDecision);
  }

  /** 在授权部门内创建决策及其唯一协作群组，并原子写入创建人和时间线事件。 */
  async create(
    authorization: AuthorizationContext,
    dto: CreateDecisionDto,
  ): Promise<DecisionDetail> {
    await this.authorizationService.assertDepartmentInScope(
      authorization,
      'decision:create',
      dto.departmentId,
    );

    const decision = await this.prisma.$transaction(async (tx) => {
      const space = await tx.discussionSpace.create({
        data: {
          name: dto.title,
          description: dto.description,
          createdById: authorization.userId,
        },
        select: { id: true },
      });

      return tx.decision.create({
        data: {
          title: dto.title,
          description: dto.description,
          deptId: dto.departmentId,
          creatorId: authorization.userId,
          ownerId: authorization.userId,
          spaceId: space.id,
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
      });
    });

    return toDecisionDetail(decision);
  }
}
