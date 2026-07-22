/*
 * @Description: 最小决策业务服务，负责数据范围过滤、创建事务与详情防越权。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type {
  DecisionDetail,
  DecisionBallotReceipt,
  DecisionEventTimelineItem,
  DecisionParticipant,
  DecisionParticipantCandidate,
  DecisionProposal,
  DecisionResolution,
  DecisionSummary,
  DecisionVoteRound,
} from '@workspace/contracts/decisions';
import { BusinessException } from '../../common/exceptions/business.exception';
import { PrismaService } from '../../database/prisma.service';
import {
  DataScope,
  DecisionEventType,
  DecisionStatus,
  ParticipantRole,
  ProposalStatus,
  ResolutionKind,
  ResolutionStatus,
  UserStatus,
  VoteMethod,
  VoteRoundStatus,
} from '../../generated/prisma';
import type { AuthorizationContext } from '../auth/types/auth.types';
import { AuthorizationService } from '../auth/services/authorization.service';
import { AddDecisionParticipantDto } from './dto/add-decision-participant.dto';
import { CreateDecisionDto } from './dto/create-decision.dto';
import { CreateDecisionProposalDto } from './dto/create-decision-proposal.dto';
import { CloseDecisionProposalDto } from './dto/close-decision-proposal.dto';
import { CreateDecisionResolutionDto } from './dto/create-decision-resolution.dto';
import { CreateDecisionVoteRoundDto } from './dto/create-decision-vote-round.dto';
import { SubmitDecisionBallotDto } from './dto/submit-decision-ballot.dto';
import { UpdateDecisionStatusDto } from './dto/update-decision-status.dto';
import {
  toDecisionDetail,
  toDecisionEvent,
  toDecisionParticipant,
  toDecisionParticipantCandidate,
  toDecisionProposal,
  toDecisionResolution,
  toDecisionSummary,
  toDecisionVoteRound,
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

/** 正式决议响应统一加载的确认人摘要。 */
const decisionResolutionInclude = {
  decidedBy: {
    select: { id: true, name: true, avatarUrl: true },
  },
} as const;

/** 仍允许调整参与者的决策状态。 */
const participantMutableStatuses = new Set<DecisionStatus>([
  DecisionStatus.DRAFT,
  DecisionStatus.DISCUSSING,
]);

/** 允许创建提案的决策状态。 */
const proposalMutableStatuses = new Set<DecisionStatus>([
  DecisionStatus.DRAFT,
  DecisionStatus.DISCUSSING,
]);

/** 普通参与者中允许创建提案的身份。 */
const proposalCreatorRoles = new Set<ParticipantRole>([
  ParticipantRole.OWNER,
  ParticipantRole.EDITOR,
]);

/** 能够提交正式选票的决策参与身份。 */
const eligibleVoterRoles = new Set<ParticipantRole>([
  ParticipantRole.OWNER,
  ParticipantRole.APPROVER,
]);

/** 构造投票轮次响应需要的关联与当前用户投票状态查询。 */
function createVoteRoundInclude(userId: number) {
  return {
    creator: {
      select: { id: true, name: true, avatarUrl: true },
    },
    options: {
      include: { _count: { select: { choices: true } } },
      orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
    },
    ballots: {
      where: { voterId: userId },
      select: { id: true },
      take: 1,
    },
    _count: { select: { ballots: true } },
  };
}

/** 可被加入决策的用户必须已启用、验证邮箱、归属部门且至少拥有一个角色。 */
const availableParticipantUserWhere = {
  status: UserStatus.ACTIVE,
  emailVerifiedAt: { not: null },
  deptId: { not: null },
  roles: { some: {} },
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
        ...availableParticipantUserWhere,
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
      const decisionLock = await tx.decision.updateMany({
        where: { id: decision.id, status: decision.status },
        data: { updatedAt: new Date() },
      });
      if (decisionLock.count !== 1) {
        throw new BusinessException({
          code: API_ERROR_CODES.DECISION_PARTICIPANT_CHANGE_NOT_ALLOWED,
          message: '决策状态已经变化，请刷新后重试',
          status: 409,
        });
      }

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

  /** 查询负责人可以加入当前决策的用户，并排除所有现有参与者。 */
  async listParticipantCandidates(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<DecisionParticipantCandidate[]> {
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
        message: '只有决策负责人可以查看可添加参与者',
        status: 403,
      });
    }

    if (!participantMutableStatuses.has(decision.status)) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_PARTICIPANT_CHANGE_NOT_ALLOWED,
        message: '当前决策状态不允许调整参与者',
        status: 409,
      });
    }

    const users = await this.prisma.user.findMany({
      where: {
        ...availableParticipantUserWhere,
        decisionParticipants: {
          none: { decisionId: decision.id },
        },
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        department: {
          select: { id: true, code: true, name: true },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return users.map(toDecisionParticipantCandidate);
  }

  /** 查询单个可访问决策的全部提案。 */
  async listProposals(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<DecisionProposal[]> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const decision = await this.prisma.decision.findFirst({
      where: {
        AND: [{ id: decisionId }, scopeWhere],
      },
      select: {
        proposals: {
          include: {
            creator: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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

    return decision.proposals.map(toDecisionProposal);
  }

  /** 在允许编辑的决策中创建开放提案，并原子写入提案创建事件。 */
  async createProposal(
    authorization: AuthorizationContext,
    decisionId: number,
    dto: CreateDecisionProposalDto,
  ): Promise<DecisionProposal> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:update',
    );
    const decision = await this.prisma.decision.findFirst({
      where: {
        AND: [{ id: decisionId }, scopeWhere],
      },
      select: {
        id: true,
        status: true,
        participants: {
          where: { userId: authorization.userId },
          select: { role: true },
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

    const canManageAll = this.authorizationService
      .getScopes(authorization, 'decision:update')
      .has(DataScope.ALL);
    const participantRole = decision.participants[0]?.role;

    if (
      !canManageAll &&
      (!participantRole || !proposalCreatorRoles.has(participantRole))
    ) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
        message: '只有决策负责人或编辑者可以创建提案',
        status: 403,
      });
    }

    if (!proposalMutableStatuses.has(decision.status)) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_PROPOSAL_CHANGE_NOT_ALLOWED,
        message: '当前决策状态不允许创建提案',
        status: 409,
      });
    }

    const proposal = await this.prisma.$transaction(async (tx) => {
      const decisionLock = await tx.decision.updateMany({
        where: { id: decision.id, status: decision.status },
        data: { updatedAt: new Date() },
      });
      if (decisionLock.count !== 1) {
        throw new BusinessException({
          code: API_ERROR_CODES.DECISION_PROPOSAL_CHANGE_NOT_ALLOWED,
          message: '决策状态已经变化，请刷新后重试',
          status: 409,
        });
      }

      const result = await tx.decisionProposal.create({
        data: {
          decisionId: decision.id,
          creatorId: authorization.userId,
          title: dto.title,
          description: dto.description,
        },
        include: {
          creator: {
            select: { id: true, name: true, avatarUrl: true },
          },
        },
      });

      await tx.decisionEvent.create({
        data: {
          decisionId: decision.id,
          actorId: authorization.userId,
          proposalId: result.id,
          type: DecisionEventType.PROPOSAL_CREATED,
          title: '创建提案',
          payload: { proposalId: result.id },
          after: {
            title: result.title,
            description: result.description,
            status: result.status,
          },
        },
      });

      return result;
    });

    return toDecisionProposal(proposal);
  }

  /** 由负责人拒绝或取消开放提案，并同步取消仍以该提案为目标的开放投票。 */
  async closeProposal(
    authorization: AuthorizationContext,
    decisionId: number,
    proposalId: number,
    dto: CloseDecisionProposalDto,
  ): Promise<DecisionProposal> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:update',
    );
    const decision = await this.prisma.decision.findFirst({
      where: { AND: [{ id: decisionId }, scopeWhere] },
      select: {
        id: true,
        ownerId: true,
        status: true,
        proposals: {
          where: { id: proposalId },
          select: { id: true, status: true },
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

    const proposal = decision.proposals[0];
    if (!proposal) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_PROPOSAL_NOT_FOUND,
        message: '提案不存在或不属于当前决策',
        status: 404,
      });
    }

    const canManageAll = this.authorizationService
      .getScopes(authorization, 'decision:update')
      .has(DataScope.ALL);
    if (!canManageAll && decision.ownerId !== authorization.userId) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
        message: '只有决策负责人可以关闭提案',
        status: 403,
      });
    }

    if (
      decision.status !== DecisionStatus.DISCUSSING ||
      proposal.status !== ProposalStatus.OPEN
    ) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_PROPOSAL_CHANGE_NOT_ALLOWED,
        message: '当前提案不能被拒绝或取消',
        status: 409,
      });
    }

    const closedAt = new Date();
    const closedProposal = await this.prisma.$transaction(async (tx) => {
      const decisionLock = await tx.decision.updateMany({
        where: { id: decision.id, status: DecisionStatus.DISCUSSING },
        data: { updatedAt: closedAt },
      });
      if (decisionLock.count !== 1) {
        throw new BusinessException({
          code: API_ERROR_CODES.DECISION_PROPOSAL_CHANGE_NOT_ALLOWED,
          message: '决策状态已经变化，请刷新后重试',
          status: 409,
        });
      }

      const openVoteRounds = await tx.decisionVoteRound.findMany({
        where: {
          decisionId: decision.id,
          status: VoteRoundStatus.OPEN,
          options: { some: { proposalId: proposal.id } },
        },
        select: { id: true },
      });
      const updateResult = await tx.decisionProposal.updateMany({
        where: {
          id: proposal.id,
          decisionId: decision.id,
          status: ProposalStatus.OPEN,
        },
        data: { status: dto.status, closedAt },
      });
      if (updateResult.count !== 1) {
        throw new BusinessException({
          code: API_ERROR_CODES.DECISION_PROPOSAL_CHANGE_NOT_ALLOWED,
          message: '提案状态已经变化，请刷新后重试',
          status: 409,
        });
      }

      const cancelledVoteRoundIds: number[] = [];
      for (const voteRound of openVoteRounds) {
        const cancelResult = await tx.decisionVoteRound.updateMany({
          where: { id: voteRound.id, status: VoteRoundStatus.OPEN },
          data: { status: VoteRoundStatus.CANCELLED, closedAt },
        });
        if (cancelResult.count === 1) {
          cancelledVoteRoundIds.push(voteRound.id);
        }
      }

      const result = await tx.decisionProposal.findUnique({
        where: { id: proposal.id },
        include: {
          creator: { select: { id: true, name: true, avatarUrl: true } },
        },
      });
      if (!result) {
        throw new BusinessException({
          code: API_ERROR_CODES.COMMON_INTERNAL_ERROR,
          message: '提案关闭失败，请稍后重试',
          status: 500,
        });
      }

      await tx.decisionEvent.create({
        data: {
          decisionId: decision.id,
          actorId: authorization.userId,
          proposalId: proposal.id,
          type: DecisionEventType.PROPOSAL_UPDATED,
          title:
            dto.status === ProposalStatus.REJECTED ? '拒绝提案' : '取消提案',
          before: { status: ProposalStatus.OPEN },
          after: { status: dto.status, closedAt: closedAt.toISOString() },
        },
      });
      for (const voteRoundId of cancelledVoteRoundIds) {
        await tx.decisionEvent.create({
          data: {
            decisionId: decision.id,
            actorId: authorization.userId,
            proposalId: proposal.id,
            voteRoundId,
            type: DecisionEventType.VOTE_ROUND_CLOSED,
            title: '提案关闭，取消投票',
            before: { status: VoteRoundStatus.OPEN },
            after: {
              status: VoteRoundStatus.CANCELLED,
              closedAt: closedAt.toISOString(),
            },
          },
        });
      }

      return result;
    });

    return toDecisionProposal(closedProposal);
  }

  /** 查询可访问决策的正式决议，并按确认时间倒序返回。 */
  async listResolutions(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<DecisionResolution[]> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const decision = await this.prisma.decision.findFirst({
      where: { AND: [{ id: decisionId }, scopeWhere] },
      select: {
        resolutions: {
          include: decisionResolutionInclude,
          orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
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

    return decision.resolutions.map(toDecisionResolution);
  }

  /** 采纳开放提案、创建最终决议并原子收口其他提案、投票和决策状态。 */
  async createResolution(
    authorization: AuthorizationContext,
    decisionId: number,
    dto: CreateDecisionResolutionDto,
  ): Promise<DecisionResolution> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:update',
    );
    const decision = await this.prisma.decision.findFirst({
      where: { AND: [{ id: decisionId }, scopeWhere] },
      select: {
        id: true,
        ownerId: true,
        status: true,
        proposals: {
          where: { id: dto.sourceProposalId },
          select: { id: true, status: true },
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

    const canManageAll = this.authorizationService
      .getScopes(authorization, 'decision:update')
      .has(DataScope.ALL);
    if (!canManageAll && decision.ownerId !== authorization.userId) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
        message: '只有决策负责人可以形成正式决议',
        status: 403,
      });
    }

    const proposal = decision.proposals[0];
    if (!proposal) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_PROPOSAL_NOT_FOUND,
        message: '来源提案不存在或不属于当前决策',
        status: 404,
      });
    }

    if (
      decision.status !== DecisionStatus.DISCUSSING ||
      proposal.status !== ProposalStatus.OPEN
    ) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_RESOLUTION_CHANGE_NOT_ALLOWED,
        message: '只有讨论中的决策和开放提案可以形成正式决议',
        status: 409,
      });
    }

    if (dto.sourceVoteRoundId !== undefined) {
      const sourceVoteRound = await this.prisma.decisionVoteRound.findFirst({
        where: {
          id: dto.sourceVoteRoundId,
          decisionId: decision.id,
          status: VoteRoundStatus.CLOSED,
          options: { some: { proposalId: proposal.id } },
        },
        select: { id: true },
      });

      if (!sourceVoteRound) {
        throw new BusinessException({
          code: API_ERROR_CODES.DECISION_RESOLUTION_SOURCE_INVALID,
          message: '来源投票必须已关闭且关联当前提案',
          status: 400,
        });
      }
    }

    const decidedAt = new Date();
    const resolution = await this.prisma.$transaction(async (tx) => {
      const decisionUpdate = await tx.decision.updateMany({
        where: { id: decision.id, status: DecisionStatus.DISCUSSING },
        data: { status: DecisionStatus.RESOLVED, decidedAt },
      });
      if (decisionUpdate.count !== 1) {
        throw new BusinessException({
          code: API_ERROR_CODES.DECISION_RESOLUTION_CHANGE_NOT_ALLOWED,
          message: '决策状态已经变化，请刷新后重试',
          status: 409,
        });
      }

      const otherOpenProposals = await tx.decisionProposal.findMany({
        where: {
          decisionId: decision.id,
          status: ProposalStatus.OPEN,
          id: { not: proposal.id },
        },
        select: { id: true },
      });
      const otherOpenVoteRounds = await tx.decisionVoteRound.findMany({
        where: { decisionId: decision.id, status: VoteRoundStatus.OPEN },
        select: { id: true },
      });
      const proposalUpdate = await tx.decisionProposal.updateMany({
        where: {
          id: proposal.id,
          decisionId: decision.id,
          status: ProposalStatus.OPEN,
        },
        data: {
          status: ProposalStatus.ACCEPTED,
          acceptedAt: decidedAt,
          closedAt: decidedAt,
        },
      });
      if (proposalUpdate.count !== 1) {
        throw new BusinessException({
          code: API_ERROR_CODES.DECISION_RESOLUTION_CHANGE_NOT_ALLOWED,
          message: '来源提案状态已经变化，请刷新后重试',
          status: 409,
        });
      }

      if (otherOpenProposals.length > 0) {
        await tx.decisionProposal.updateMany({
          where: {
            id: { in: otherOpenProposals.map((item) => item.id) },
            status: ProposalStatus.OPEN,
          },
          data: { status: ProposalStatus.CANCELLED, closedAt: decidedAt },
        });
      }
      const cancelledVoteRoundIds: number[] = [];
      for (const voteRound of otherOpenVoteRounds) {
        const cancelResult = await tx.decisionVoteRound.updateMany({
          where: { id: voteRound.id, status: VoteRoundStatus.OPEN },
          data: { status: VoteRoundStatus.CANCELLED, closedAt: decidedAt },
        });
        if (cancelResult.count === 1) {
          cancelledVoteRoundIds.push(voteRound.id);
        }
      }

      const result = await tx.decisionResolution.create({
        data: {
          decisionId: decision.id,
          sourceProposalId: proposal.id,
          sourceVoteRoundId: dto.sourceVoteRoundId,
          decidedById: authorization.userId,
          title: dto.title,
          content: dto.content,
          kind: ResolutionKind.FINAL,
          status: ResolutionStatus.ACTIVE,
          decidedAt,
        },
        include: decisionResolutionInclude,
      });

      await tx.decisionEvent.create({
        data: {
          decisionId: decision.id,
          actorId: authorization.userId,
          proposalId: proposal.id,
          type: DecisionEventType.PROPOSAL_UPDATED,
          title: '采纳提案',
          before: { status: ProposalStatus.OPEN },
          after: {
            status: ProposalStatus.ACCEPTED,
            acceptedAt: decidedAt.toISOString(),
          },
        },
      });
      for (const otherProposal of otherOpenProposals) {
        await tx.decisionEvent.create({
          data: {
            decisionId: decision.id,
            actorId: authorization.userId,
            proposalId: otherProposal.id,
            type: DecisionEventType.PROPOSAL_UPDATED,
            title: '决议形成，取消其他提案',
            before: { status: ProposalStatus.OPEN },
            after: {
              status: ProposalStatus.CANCELLED,
              closedAt: decidedAt.toISOString(),
            },
          },
        });
      }
      for (const voteRoundId of cancelledVoteRoundIds) {
        await tx.decisionEvent.create({
          data: {
            decisionId: decision.id,
            actorId: authorization.userId,
            voteRoundId,
            type: DecisionEventType.VOTE_ROUND_CLOSED,
            title: '决议形成，取消其他投票',
            before: { status: VoteRoundStatus.OPEN },
            after: {
              status: VoteRoundStatus.CANCELLED,
              closedAt: decidedAt.toISOString(),
            },
          },
        });
      }
      await tx.decisionEvent.create({
        data: {
          decisionId: decision.id,
          actorId: authorization.userId,
          proposalId: proposal.id,
          voteRoundId: dto.sourceVoteRoundId,
          resolutionId: result.id,
          type: DecisionEventType.RESOLUTION_CREATED,
          title: '形成正式决议',
          payload: {
            sourceProposalId: proposal.id,
            sourceVoteRoundId: dto.sourceVoteRoundId ?? null,
          },
          after: {
            title: result.title,
            content: result.content,
            kind: result.kind,
            status: result.status,
          },
        },
      });
      await tx.decisionEvent.create({
        data: {
          decisionId: decision.id,
          actorId: authorization.userId,
          resolutionId: result.id,
          type: DecisionEventType.STATUS_CHANGED,
          title: '决策已形成结论',
          before: { status: DecisionStatus.DISCUSSING },
          after: {
            status: DecisionStatus.RESOLVED,
            decidedAt: decidedAt.toISOString(),
          },
        },
      });

      return result;
    });

    return toDecisionResolution(resolution);
  }

  /** 查询可访问决策的投票轮次，开放期间不返回实时选项票数。 */
  async listVoteRounds(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<DecisionVoteRound[]> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const decision = await this.prisma.decision.findFirst({
      where: { AND: [{ id: decisionId }, scopeWhere] },
      select: {
        voteRounds: {
          include: createVoteRoundInclude(authorization.userId),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

    return decision.voteRounds.map(toDecisionVoteRound);
  }

  /** 由负责人为开放提案创建并立即开启标准赞成、反对、弃权投票。 */
  async createVoteRound(
    authorization: AuthorizationContext,
    decisionId: number,
    dto: CreateDecisionVoteRoundDto,
  ): Promise<DecisionVoteRound> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:update',
    );
    const decision = await this.prisma.decision.findFirst({
      where: { AND: [{ id: decisionId }, scopeWhere] },
      select: {
        id: true,
        ownerId: true,
        status: true,
        proposals: {
          where: { id: dto.proposalId, status: ProposalStatus.OPEN },
          select: { id: true, title: true },
          take: 1,
        },
        voteRounds: {
          where: {
            status: VoteRoundStatus.OPEN,
            options: { some: { proposalId: dto.proposalId } },
          },
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

    const canManageAll = this.authorizationService
      .getScopes(authorization, 'decision:update')
      .has(DataScope.ALL);

    if (!canManageAll && decision.ownerId !== authorization.userId) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
        message: '只有决策负责人可以开启投票',
        status: 403,
      });
    }

    if (decision.status !== DecisionStatus.DISCUSSING) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_VOTE_ROUND_CHANGE_NOT_ALLOWED,
        message: '只有讨论中的决策可以开启投票',
        status: 409,
      });
    }

    const proposal = decision.proposals[0];
    if (!proposal) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_PROPOSAL_NOT_FOUND,
        message: '开放提案不存在或不属于当前决策',
        status: 404,
      });
    }

    if (decision.voteRounds.length > 0) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_VOTE_ROUND_ALREADY_OPEN,
        message: '该提案已经存在进行中的投票',
        status: 409,
      });
    }

    const openedAt = new Date();
    const round = await this.prisma.$transaction(async (tx) => {
      const decisionLock = await tx.decision.updateMany({
        where: { id: decision.id, status: DecisionStatus.DISCUSSING },
        data: { updatedAt: openedAt },
      });
      if (decisionLock.count !== 1) {
        throw new BusinessException({
          code: API_ERROR_CODES.DECISION_VOTE_ROUND_CHANGE_NOT_ALLOWED,
          message: '决策状态已经变化，请刷新后重试',
          status: 409,
        });
      }

      const result = await tx.decisionVoteRound.create({
        data: {
          decisionId: decision.id,
          creatorId: authorization.userId,
          title: dto.title ?? `是否采纳「${proposal.title}」`,
          description: dto.description,
          method: VoteMethod.SINGLE_CHOICE,
          status: VoteRoundStatus.OPEN,
          isAnonymous: dto.isAnonymous ?? false,
          quorumCount: dto.quorumCount,
          maxChoices: 1,
          openedAt,
          options: {
            create: [
              {
                proposalId: proposal.id,
                code: 'APPROVE',
                label: '赞成',
                sortOrder: 1,
              },
              { code: 'REJECT', label: '反对', sortOrder: 2 },
              { code: 'ABSTAIN', label: '弃权', sortOrder: 3 },
            ],
          },
        },
        include: createVoteRoundInclude(authorization.userId),
      });

      await tx.decisionEvent.create({
        data: {
          decisionId: decision.id,
          actorId: authorization.userId,
          proposalId: proposal.id,
          voteRoundId: result.id,
          type: DecisionEventType.VOTE_ROUND_CREATED,
          title: '创建投票轮次',
          payload: { proposalId: proposal.id, voteRoundId: result.id },
          after: {
            method: result.method,
            isAnonymous: result.isAnonymous,
            quorumCount: result.quorumCount,
          },
        },
      });
      await tx.decisionEvent.create({
        data: {
          decisionId: decision.id,
          actorId: authorization.userId,
          proposalId: proposal.id,
          voteRoundId: result.id,
          type: DecisionEventType.VOTE_ROUND_OPENED,
          title: '开启投票',
          after: {
            status: VoteRoundStatus.OPEN,
            openedAt: openedAt.toISOString(),
          },
        },
      });

      return result;
    });

    return toDecisionVoteRound(round);
  }

  /** 校验参与资格后提交单选选票，并通过轮次行更新与关闭操作串行化。 */
  async submitBallot(
    authorization: AuthorizationContext,
    decisionId: number,
    voteRoundId: number,
    dto: SubmitDecisionBallotDto,
  ): Promise<DecisionBallotReceipt> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const decision = await this.prisma.decision.findFirst({
      where: { AND: [{ id: decisionId }, scopeWhere] },
      select: {
        id: true,
        status: true,
        participants: {
          where: { userId: authorization.userId },
          select: { role: true },
          take: 1,
        },
        voteRounds: {
          where: { id: voteRoundId },
          select: {
            id: true,
            status: true,
            isAnonymous: true,
            options: {
              where: { id: dto.optionId },
              select: { id: true },
              take: 1,
            },
          },
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

    const round = decision.voteRounds[0];
    if (!round) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_VOTE_ROUND_NOT_FOUND,
        message: '投票轮次不存在或不属于当前决策',
        status: 404,
      });
    }

    const participantRole = decision.participants[0]?.role;
    if (!participantRole || !eligibleVoterRoles.has(participantRole)) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_VOTER_NOT_ELIGIBLE,
        message: '只有决策负责人或审批者可以投票',
        status: 403,
      });
    }

    if (
      decision.status !== DecisionStatus.DISCUSSING ||
      round.status !== VoteRoundStatus.OPEN
    ) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_VOTE_ROUND_CHANGE_NOT_ALLOWED,
        message: '当前投票轮次不接受选票',
        status: 409,
      });
    }

    if (round.options.length === 0) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_VOTE_OPTION_INVALID,
        message: '投票选项不存在或不属于当前轮次',
        status: 400,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const lockResult = await tx.decisionVoteRound.updateMany({
        where: {
          id: round.id,
          decisionId: decision.id,
          status: VoteRoundStatus.OPEN,
        },
        data: { updatedAt: new Date() },
      });
      if (lockResult.count !== 1) {
        throw new BusinessException({
          code: API_ERROR_CODES.DECISION_VOTE_ROUND_CHANGE_NOT_ALLOWED,
          message: '投票已经关闭，请刷新后重试',
          status: 409,
        });
      }

      const createResult = await tx.decisionBallot.createMany({
        data: {
          roundId: round.id,
          voterId: authorization.userId,
          reason: dto.reason,
        },
        skipDuplicates: true,
      });
      if (createResult.count !== 1) {
        throw new BusinessException({
          code: API_ERROR_CODES.DECISION_BALLOT_ALREADY_SUBMITTED,
          message: '你已经提交过本轮选票',
          status: 409,
        });
      }

      const ballot = await tx.decisionBallot.findUnique({
        where: {
          roundId_voterId: {
            roundId: round.id,
            voterId: authorization.userId,
          },
        },
        select: { id: true, roundId: true, submittedAt: true },
      });
      if (!ballot) {
        throw new BusinessException({
          code: API_ERROR_CODES.COMMON_INTERNAL_ERROR,
          message: '选票提交失败，请稍后重试',
          status: 500,
        });
      }

      await tx.decisionBallotChoice.create({
        data: {
          roundId: round.id,
          ballotId: ballot.id,
          optionId: dto.optionId,
        },
      });
      await tx.decisionEvent.create({
        data: {
          decisionId: decision.id,
          actorId: round.isAnonymous ? null : authorization.userId,
          voteRoundId: round.id,
          type: DecisionEventType.VOTE_CAST,
          title: round.isAnonymous ? '匿名参与者已投票' : '参与者已投票',
          payload: round.isAnonymous
            ? { anonymous: true }
            : { optionId: dto.optionId },
        },
      });

      return {
        id: ballot.id,
        roundId: ballot.roundId,
        selectedOptionId: dto.optionId,
        submittedAt: ballot.submittedAt.toISOString(),
      };
    });
  }

  /** 由负责人关闭开放轮次，统计结果并将稳定快照写入时间线。 */
  async closeVoteRound(
    authorization: AuthorizationContext,
    decisionId: number,
    voteRoundId: number,
  ): Promise<DecisionVoteRound> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:update',
    );
    const decision = await this.prisma.decision.findFirst({
      where: { AND: [{ id: decisionId }, scopeWhere] },
      select: {
        id: true,
        ownerId: true,
        status: true,
        voteRounds: {
          where: { id: voteRoundId },
          select: { id: true, status: true },
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

    const round = decision.voteRounds[0];
    if (!round) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_VOTE_ROUND_NOT_FOUND,
        message: '投票轮次不存在或不属于当前决策',
        status: 404,
      });
    }

    const canManageAll = this.authorizationService
      .getScopes(authorization, 'decision:update')
      .has(DataScope.ALL);
    if (!canManageAll && decision.ownerId !== authorization.userId) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
        message: '只有决策负责人可以关闭投票',
        status: 403,
      });
    }

    if (
      decision.status !== DecisionStatus.DISCUSSING ||
      round.status !== VoteRoundStatus.OPEN
    ) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_VOTE_ROUND_CHANGE_NOT_ALLOWED,
        message: '当前投票轮次不能关闭',
        status: 409,
      });
    }

    const closedAt = new Date();
    const closedRound = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.decisionVoteRound.updateMany({
        where: {
          id: round.id,
          decisionId: decision.id,
          status: VoteRoundStatus.OPEN,
        },
        data: { status: VoteRoundStatus.CLOSED, closedAt },
      });
      if (updateResult.count !== 1) {
        throw new BusinessException({
          code: API_ERROR_CODES.DECISION_VOTE_ROUND_CHANGE_NOT_ALLOWED,
          message: '投票状态已经变化，请刷新后重试',
          status: 409,
        });
      }

      const result = await tx.decisionVoteRound.findUnique({
        where: { id: round.id },
        include: createVoteRoundInclude(authorization.userId),
      });
      if (!result) {
        throw new BusinessException({
          code: API_ERROR_CODES.COMMON_INTERNAL_ERROR,
          message: '投票关闭失败，请稍后重试',
          status: 500,
        });
      }

      const mappedResult = toDecisionVoteRound(result);
      await tx.decisionEvent.create({
        data: {
          decisionId: decision.id,
          actorId: authorization.userId,
          proposalId: mappedResult.proposalId,
          voteRoundId: round.id,
          type: DecisionEventType.VOTE_ROUND_CLOSED,
          title: '关闭投票',
          payload: {
            result: mappedResult.result,
            options: mappedResult.options.map((option) => ({
              id: option.id,
              code: option.code,
              label: option.label,
              voteCount: option.voteCount,
            })),
          },
          before: { status: VoteRoundStatus.OPEN },
          after: {
            status: VoteRoundStatus.CLOSED,
            closedAt: closedAt.toISOString(),
          },
        },
      });

      return result;
    });

    return toDecisionVoteRound(closedRound);
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
