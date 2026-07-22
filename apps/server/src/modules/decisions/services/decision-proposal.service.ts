/**
 * 本文件负责决策提案的查询、创建、关闭以及关联投票的事务收口。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type {
  DecisionProposal,
  DecisionProposalListResponse,
} from '@workspace/contracts/decisions';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  DataScope,
  DecisionEventType,
  DecisionStatus,
  ParticipantRole,
  ProposalStatus,
  VoteRoundStatus,
} from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { CloseDecisionProposalDto } from '../dto/close-decision-proposal.dto';
import { CreateDecisionProposalDto } from '../dto/create-decision-proposal.dto';
import { toDecisionProposal } from '../decisions.mapper';

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

@Injectable()
export class DecisionProposalService {
  /** 注入数据库与统一授权服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** 查询单个可访问决策的全部提案。 */
  async list(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<DecisionProposalListResponse> {
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
  async create(
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
  async close(
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
}
