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
  DecisionEventType,
  DecisionStatus,
  DiscussionAreaMemberRole,
  DiscussionAreaType,
  MatterMemberRole,
  MatterStatus,
  MeetingStatus,
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
import { MatterAccessService } from '../../matters/services/matter-access.service';

/** 决策列表与详情统一加载的基础关系。 */
const decisionSummaryInclude = {
  matter: { select: { id: true, title: true } },
  area: { select: { id: true, name: true } },
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

/** 创建决策时写入的一条初始参与关系。 */
type InitialDecisionParticipant = {
  /** 被继承的议事或分区成员主键。 */
  userId: number;
  /** 成员在决策中的初始协作角色。 */
  role: ParticipantRole;
};

/** 把议事成员身份映射为决策中的默认协作角色。 */
function mapMatterMemberRole(role: MatterMemberRole): ParticipantRole {
  if (role === MatterMemberRole.OWNER || role === MatterMemberRole.MANAGER) {
    return ParticipantRole.EDITOR;
  }
  if (role === MatterMemberRole.MEMBER) {
    return ParticipantRole.APPROVER;
  }
  return ParticipantRole.VIEWER;
}

/** 把私有分区成员身份映射为决策中的默认协作角色。 */
function mapAreaMemberRole(role: DiscussionAreaMemberRole): ParticipantRole {
  return role === DiscussionAreaMemberRole.MANAGER
    ? ParticipantRole.EDITOR
    : ParticipantRole.APPROVER;
}

/** 去重继承的成员，并确保决策创建者始终是唯一负责人。 */
function buildInitialParticipants(
  inheritedParticipants: InitialDecisionParticipant[],
  ownerId: number,
): InitialDecisionParticipant[] {
  const participantsByUserId = new Map(
    inheritedParticipants.map((participant) => [
      participant.userId,
      participant,
    ]),
  );
  participantsByUserId.set(ownerId, {
    userId: ownerId,
    role: ParticipantRole.OWNER,
  });
  return [...participantsByUserId.values()];
}

@Injectable()
export class DecisionCoreService {
  /** 注入数据库与统一授权服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
    private readonly matterAccessService: MatterAccessService,
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

  /** 返回指定议事下当前成员可见的全部正式决策。 */
  async listMatter(
    authorization: AuthorizationContext,
    matterId: number,
  ): Promise<DecisionListResponse> {
    await this.matterAccessService.findMatter(authorization, matterId);
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const decisions = await this.prisma.decision.findMany({
      where: { AND: [{ matterId }, scopeWhere] },
      include: decisionSummaryInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });

    return decisions.map(toDecisionSummary);
  }

  /** 查询单个可访问决策，越权与不存在统一返回 404。 */
  async get(
    authorization: AuthorizationContext,
    decisionId: number,
    matterId?: number,
  ): Promise<DecisionDetail> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const decision = await this.prisma.decision.findFirst({
      where: {
        AND: [
          { id: decisionId },
          ...(matterId === undefined ? [] : [{ matterId }]),
          scopeWhere,
        ],
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

    if (decision.ownerId !== authorization.userId) {
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

  /** 在进行中的议事内创建决策，并继承当前协作范围成员和时间线事件。 */
  async create(
    authorization: AuthorizationContext,
    matterId: number,
    dto: CreateDecisionDto,
  ): Promise<DecisionDetail> {
    const matter = await this.matterAccessService.findMatter(
      authorization,
      matterId,
    );
    if (matter.status !== MatterStatus.ACTIVE) {
      throw new BusinessException({
        code: API_ERROR_CODES.MATTER_READ_ONLY,
        message: '只有进行中的议事可以创建决策',
        status: 409,
      });
    }
    await this.authorizationService.assertDepartmentInScope(
      authorization,
      'decision:create',
      dto.departmentId,
    );

    if (dto.areaId !== undefined) {
      const area = await this.matterAccessService.findArea(
        authorization,
        matterId,
        dto.areaId,
      );
      this.matterAccessService.assertAreaWritable(area);
      if (area.type !== DiscussionAreaType.PRIVATE) {
        throw new BusinessException({
          code: API_ERROR_CODES.DECISION_AREA_INVALID,
          message: '公共讨论区应创建议事级决策',
          status: 400,
        });
      }
    }

    if (dto.meetingId !== undefined) {
      const sourceMeeting = await this.prisma.meetingSession.findFirst({
        where: {
          id: dto.meetingId,
          status: MeetingStatus.LIVE,
          ...(dto.areaId === undefined ? {} : { areaId: dto.areaId }),
          area: {
            matterId,
            OR: [
              { type: 'PUBLIC' },
              { members: { some: { userId: authorization.userId } } },
            ],
          },
          participants: { some: { userId: authorization.userId } },
        },
        select: { id: true },
      });
      if (!sourceMeeting) {
        throw new BusinessException({
          code: API_ERROR_CODES.MEETING_NOT_FOUND,
          message: '来源会议不存在、未进行或当前用户不是受邀成员',
          status: 404,
        });
      }
    }

    const decision = await this.prisma.$transaction(async (tx) => {
      const inheritedParticipants =
        dto.areaId === undefined
          ? (
              await tx.matterMember.findMany({
                where: { matterId },
                select: { userId: true, role: true },
              })
            ).map((member) => ({
              userId: member.userId,
              role: mapMatterMemberRole(member.role),
            }))
          : (
              await tx.discussionAreaMember.findMany({
                where: { areaId: dto.areaId, area: { matterId } },
                select: { userId: true, role: true },
              })
            ).map((member) => ({
              userId: member.userId,
              role: mapAreaMemberRole(member.role),
            }));
      const initialParticipants = buildInitialParticipants(
        inheritedParticipants,
        authorization.userId,
      );

      return tx.decision.create({
        data: {
          title: dto.title,
          description: dto.description,
          matterId,
          areaId: dto.areaId,
          deptId: dto.departmentId,
          creatorId: authorization.userId,
          ownerId: authorization.userId,
          participants: {
            create: initialParticipants,
          },
          events: {
            create: {
              actorId: authorization.userId,
              type: DecisionEventType.DECISION_CREATED,
              title: '创建决策',
              payload: {
                matterId,
                areaId: dto.areaId ?? null,
                scope: dto.areaId === undefined ? 'MATTER' : 'AREA',
                departmentId: dto.departmentId,
                meetingId: dto.meetingId ?? null,
                inheritedParticipantCount: initialParticipants.length,
              },
              meetingId: dto.meetingId,
            },
          },
          ...(dto.meetingId === undefined
            ? {}
            : {
                meetingLinks: {
                  create: { meetingId: dto.meetingId },
                },
              }),
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
