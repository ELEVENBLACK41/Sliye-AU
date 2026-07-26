/**
 * 本文件负责决策投票轮次、选票提交、结果统计和投票时间线事件。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type {
  DecisionBallotReceipt,
  DecisionVoteRound,
  DecisionVoteRoundListResponse,
} from '@workspace/contracts/decisions';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  DecisionEventType,
  DecisionStatus,
  ParticipantRole,
  ProposalStatus,
  VoteMethod,
  VoteRoundStatus,
} from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { MeetingContextService } from '../../meetings/services/meeting-context.service';
import { CreateDecisionVoteRoundDto } from '../dto/create-decision-vote-round.dto';
import { SubmitDecisionBallotDto } from '../dto/submit-decision-ballot.dto';
import { toDecisionVoteRound } from '../decisions.mapper';

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

@Injectable()
export class DecisionVoteService {
  /** 注入数据库与统一授权服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
    private readonly meetingContextService: MeetingContextService,
  ) {}

  /** 查询可访问决策的投票轮次，开放期间不返回实时选项票数。 */
  async list(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<DecisionVoteRoundListResponse> {
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
  async create(
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

    if (decision.ownerId !== authorization.userId) {
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

      const meetingId =
        await this.meetingContextService.resolveWritableMeetingId(
          decision.id,
          dto.meetingId,
          authorization.userId,
          tx,
        );

      const result = await tx.decisionVoteRound.create({
        data: {
          decisionId: decision.id,
          creatorId: authorization.userId,
          meetingId,
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
          meetingId,
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
          meetingId,
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
  async submit(
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
  async close(
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

    if (decision.ownerId !== authorization.userId) {
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
}
