/*
 * @Description: 最小决策业务服务，负责数据范围过滤、创建事务与详情防越权。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type {
  DecisionDetail,
  DecisionEventTimelineItem,
  DecisionParticipant,
  DecisionSummary,
} from '@workspace/contracts/decisions';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import {
  DataScope,
  DecisionEventType,
  DecisionStatus,
  ParticipantRole,
  UserStatus,
} from '../../generated/prisma';
import type { AuthorizationContext } from '../auth/types/auth.types';
import { AuthorizationService } from '../auth/services/authorization.service';
import { AddDecisionParticipantDto } from './dto/add-decision-participant.dto';
import { CreateDecisionDto } from './dto/create-decision.dto';
import { UpdateDecisionStatusDto } from './dto/update-decision-status.dto';
import {
  toDecisionDetail,
  toDecisionEvent,
  toDecisionParticipant,
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

/** 仍允许调整参与者的决策状态。 */
const participantMutableStatuses = new Set<DecisionStatus>([
  DecisionStatus.DRAFT,
  DecisionStatus.DISCUSSING,
]);

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

  /** 向负责人管理的决策添加参与者，并原子写入参与者新增事件。 */
  async addParticipant(
    authorization: AuthorizationContext,
    decisionId: number,
    dto: AddDecisionParticipantDto,
  ): Promise<DecisionParticipant> {
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
        message: '只有决策负责人可以添加参与者',
        status: 403,
      });
    }

    if (!participantMutableStatuses.has(decision.status)) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_PARTICIPANT_CHANGE_NOT_ALLOWED,
        message: '当前决策状态不允许添加参与者',
        status: 409,
      });
    }

    const targetUser = await this.prisma.user.findFirst({
      where: {
        id: dto.userId,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: { not: null },
        deptId: { not: null },
        roles: { some: {} },
      },
      select: { id: true },
    });

    if (!targetUser) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_PARTICIPANT_USER_NOT_FOUND,
        message: '目标用户不存在或当前不可加入决策',
        status: 404,
      });
    }

    const participant = await this.prisma.$transaction(async (tx) => {
      const createResult = await tx.decisionParticipant.createMany({
        data: {
          decisionId: decision.id,
          userId: targetUser.id,
          role: dto.role,
        },
        skipDuplicates: true,
      });

      if (createResult.count !== 1) {
        throw new BusinessException({
          code: API_ERROR_CODES.DECISION_PARTICIPANT_ALREADY_EXISTS,
          message: '该用户已经是当前决策的参与者',
          status: 409,
        });
      }

      const result = await tx.decisionParticipant.findUnique({
        where: {
          decisionId_userId: {
            decisionId: decision.id,
            userId: targetUser.id,
          },
        },
        include: {
          user: {
            select: { id: true, name: true, avatarUrl: true },
          },
        },
      });

      if (!result) {
        throw new BusinessException({
          code: API_ERROR_CODES.COMMON_INTERNAL_ERROR,
          message: '参与者创建失败，请稍后重试',
          status: 500,
        });
      }

      await tx.decisionEvent.create({
        data: {
          decisionId: decision.id,
          actorId: authorization.userId,
          type: DecisionEventType.PARTICIPANT_ADDED,
          title: '添加参与者',
          payload: {
            participantId: result.id,
            userId: targetUser.id,
          },
          after: { role: result.role },
        },
      });

      return result;
    });

    return toDecisionParticipant(participant);
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
