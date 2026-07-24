/**
 * 本文件负责正式决议的查询、创建以及提案、投票和决策状态的原子收口。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type {
  DecisionResolution,
  DecisionResolutionListResponse,
} from '@workspace/contracts/decisions';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  DataScope,
  DecisionEventType,
  DecisionStatus,
  DiscussionSpaceStatus,
  ProposalStatus,
  ResolutionKind,
  ResolutionStatus,
  VoteRoundStatus,
} from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { MeetingContextService } from '../../meetings/services/meeting-context.service';
import { CreateDecisionResolutionDto } from '../dto/create-decision-resolution.dto';
import { toDecisionResolution } from '../decisions.mapper';

/** 正式决议响应统一加载的确认人摘要。 */
const decisionResolutionInclude = {
  decidedBy: {
    select: { id: true, name: true, avatarUrl: true },
  },
} as const;

@Injectable()
export class DecisionResolutionService {
  /** 注入数据库与统一授权服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
    private readonly meetingContextService: MeetingContextService,
  ) {}

  /** 查询可访问决策的正式决议，并按确认时间倒序返回。 */
  async list(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<DecisionResolutionListResponse> {
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
  async create(
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
        spaceId: true,
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

      const meetingId =
        await this.meetingContextService.resolveWritableMeetingId(
          decision.id,
          dto.meetingId,
          tx,
        );

      await tx.discussionSpace.update({
        where: { id: decision.spaceId },
        data: {
          status: DiscussionSpaceStatus.READ_ONLY,
          closedAt: decidedAt,
        },
      });

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
          meetingId,
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
          meetingId,
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
            meetingId,
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
            meetingId,
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
          meetingId,
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
          meetingId,
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
}
