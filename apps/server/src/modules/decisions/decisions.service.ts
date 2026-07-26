/*
 * @Description: 决策模块门面服务，保持控制器调用稳定并将业务委托给各职责服务。
 */
import { Injectable } from '@nestjs/common';
import type {
  DecisionBallotReceipt,
  DecisionDetail,
  DecisionEventTimelineResponse,
  DecisionListResponse,
  DecisionParticipant,
  DecisionParticipantCandidateListResponse,
  DecisionProposal,
  DecisionProposalListResponse,
  DecisionResolution,
  DecisionResolutionListResponse,
  DecisionVoteRound,
  DecisionVoteRoundListResponse,
} from '@workspace/contracts/decisions';
import type { AuthorizationContext } from '../auth/types/auth.types';
import { AddDecisionParticipantDto } from './dto/add-decision-participant.dto';
import { CloseDecisionProposalDto } from './dto/close-decision-proposal.dto';
import { CreateDecisionProposalDto } from './dto/create-decision-proposal.dto';
import { CreateDecisionResolutionDto } from './dto/create-decision-resolution.dto';
import { CreateDecisionVoteRoundDto } from './dto/create-decision-vote-round.dto';
import { CreateDecisionDto } from './dto/create-decision.dto';
import { SubmitDecisionBallotDto } from './dto/submit-decision-ballot.dto';
import { UpdateDecisionStatusDto } from './dto/update-decision-status.dto';
import { DecisionCoreService } from './services/decision-core.service';
import { DecisionParticipantService } from './services/decision-participant.service';
import { DecisionProposalService } from './services/decision-proposal.service';
import { DecisionResolutionService } from './services/decision-resolution.service';
import { DecisionVoteService } from './services/decision-vote.service';

@Injectable()
export class DecisionsService {
  constructor(
    private readonly coreService: DecisionCoreService,
    private readonly participantService: DecisionParticipantService,
    private readonly proposalService: DecisionProposalService,
    private readonly resolutionService: DecisionResolutionService,
    private readonly voteService: DecisionVoteService,
  ) {}

  /** 返回经过数据范围裁剪的决策列表。 */
  async list(
    authorization: AuthorizationContext,
  ): Promise<DecisionListResponse> {
    return this.coreService.list(authorization);
  }

  /** 返回指定议事下当前成员可见的决策列表。 */
  async listMatter(
    authorization: AuthorizationContext,
    matterId: number,
  ): Promise<DecisionListResponse> {
    return this.coreService.listMatter(authorization, matterId);
  }

  /** 查询当前用户可访问的单个决策详情。 */
  async get(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<DecisionDetail> {
    return this.coreService.get(authorization, decisionId);
  }

  /** 查询指定议事中的单项决策详情。 */
  async getMatterDecision(
    authorization: AuthorizationContext,
    matterId: number,
    decisionId: number,
  ): Promise<DecisionDetail> {
    return this.coreService.get(authorization, decisionId, matterId);
  }

  /** 查询当前用户可访问决策的完整事件时间线。 */
  async listEvents(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<DecisionEventTimelineResponse> {
    return this.coreService.listEvents(authorization, decisionId);
  }

  /** 更新决策状态并返回最新详情。 */
  async updateStatus(
    authorization: AuthorizationContext,
    decisionId: number,
    dto: UpdateDecisionStatusDto,
  ): Promise<DecisionDetail> {
    return this.coreService.updateStatus(authorization, decisionId, dto);
  }

  /** 创建决策并返回完整详情。 */
  async create(
    authorization: AuthorizationContext,
    matterId: number,
    dto: CreateDecisionDto,
  ): Promise<DecisionDetail> {
    return this.coreService.create(authorization, matterId, dto);
  }

  /** 向决策中添加参与者。 */
  async addParticipant(
    authorization: AuthorizationContext,
    decisionId: number,
    dto: AddDecisionParticipantDto,
  ): Promise<DecisionParticipant> {
    return this.participantService.add(authorization, decisionId, dto);
  }

  /** 查询当前决策可添加的参与者候选人。 */
  async listParticipantCandidates(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<DecisionParticipantCandidateListResponse> {
    return this.participantService.listCandidates(authorization, decisionId);
  }

  /** 查询当前用户可访问决策的提案列表。 */
  async listProposals(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<DecisionProposalListResponse> {
    return this.proposalService.list(authorization, decisionId);
  }

  /** 在指定决策下创建提案。 */
  async createProposal(
    authorization: AuthorizationContext,
    decisionId: number,
    dto: CreateDecisionProposalDto,
  ): Promise<DecisionProposal> {
    return this.proposalService.create(authorization, decisionId, dto);
  }

  /** 关闭指定提案并返回最新提案。 */
  async closeProposal(
    authorization: AuthorizationContext,
    decisionId: number,
    proposalId: number,
    dto: CloseDecisionProposalDto,
  ): Promise<DecisionProposal> {
    return this.proposalService.close(
      authorization,
      decisionId,
      proposalId,
      dto,
    );
  }

  /** 查询当前用户可访问决策的正式决议列表。 */
  async listResolutions(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<DecisionResolutionListResponse> {
    return this.resolutionService.list(authorization, decisionId);
  }

  /** 在指定决策下创建正式决议。 */
  async createResolution(
    authorization: AuthorizationContext,
    decisionId: number,
    dto: CreateDecisionResolutionDto,
  ): Promise<DecisionResolution> {
    return this.resolutionService.create(authorization, decisionId, dto);
  }

  /** 查询当前用户可访问决策的投票轮次列表。 */
  async listVoteRounds(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<DecisionVoteRoundListResponse> {
    return this.voteService.list(authorization, decisionId);
  }

  /** 在指定决策下创建投票轮次。 */
  async createVoteRound(
    authorization: AuthorizationContext,
    decisionId: number,
    dto: CreateDecisionVoteRoundDto,
  ): Promise<DecisionVoteRound> {
    return this.voteService.create(authorization, decisionId, dto);
  }

  /** 向指定投票轮次提交当前用户的选票。 */
  async submitBallot(
    authorization: AuthorizationContext,
    decisionId: number,
    voteRoundId: number,
    dto: SubmitDecisionBallotDto,
  ): Promise<DecisionBallotReceipt> {
    return this.voteService.submit(authorization, decisionId, voteRoundId, dto);
  }

  /** 关闭指定投票轮次并返回结算结果。 */
  async closeVoteRound(
    authorization: AuthorizationContext,
    decisionId: number,
    voteRoundId: number,
  ): Promise<DecisionVoteRound> {
    return this.voteService.close(authorization, decisionId, voteRoundId);
  }
}
