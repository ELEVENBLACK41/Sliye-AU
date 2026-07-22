/*
 * @Description: 最小决策接口控制器，声明功能权限并交由 Service 执行数据范围。
 */
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAuthorization } from '../auth/decorators/current-authorization.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { AuthorizationContext } from '../auth/types/auth.types';
import { AddDecisionParticipantDto } from './dto/add-decision-participant.dto';
import { CreateDecisionChatMessageDto } from './dto/create-decision-chat-message.dto';
import { CreateDecisionDto } from './dto/create-decision.dto';
import { CreateDecisionProposalDto } from './dto/create-decision-proposal.dto';
import { CloseDecisionProposalDto } from './dto/close-decision-proposal.dto';
import { CreateDecisionResolutionDto } from './dto/create-decision-resolution.dto';
import { CreateDecisionVoteRoundDto } from './dto/create-decision-vote-round.dto';
import { ListDecisionChatMessagesDto } from './dto/list-decision-chat-messages.dto';
import { SubmitDecisionBallotDto } from './dto/submit-decision-ballot.dto';
import { UpdateDecisionStatusDto } from './dto/update-decision-status.dto';
import { DecisionsService } from './decisions.service';
import { DecisionChatService } from './services/decision-chat.service';

@ApiTags('decisions')
@ApiBearerAuth()
@Controller('decisions')
export class DecisionsController {
  /** 注入决策业务服务。 */
  constructor(
    private readonly decisionsService: DecisionsService,
    private readonly decisionChatService: DecisionChatService,
  ) {}

  /** 查询当前用户可见的决策列表。 */
  @Get()
  @RequirePermissions('decision:read')
  @ApiOperation({ summary: '查询授权范围内的决策列表' })
  list(@CurrentAuthorization() authorization: AuthorizationContext) {
    return this.decisionsService.list(authorization);
  }

  /** 创建当前用户有权使用目标部门的新决策。 */
  @Post()
  @RequirePermissions('decision:create')
  @ApiOperation({ summary: '创建决策并写入创建事件' })
  create(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Body() body: CreateDecisionDto,
  ) {
    return this.decisionsService.create(authorization, body);
  }

  /** 查询当前账号可见的决策群聊消息，支持向前分页和断线后向后补齐。 */
  @Get(':decisionId/messages')
  @RequirePermissions('decision:read')
  @ApiOperation({ summary: '查询决策群聊消息' })
  listMessages(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('decisionId', ParseIntPipe) decisionId: number,
    @Query() query: ListDecisionChatMessagesDto,
  ) {
    return this.decisionChatService.list(authorization, decisionId, query);
  }

  /** 由当前决策参与者幂等发送一条文字消息。 */
  @Post(':decisionId/messages')
  @RequirePermissions('decision:read')
  @ApiOperation({ summary: '发送决策群聊文字消息' })
  createMessage(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('decisionId', ParseIntPipe) decisionId: number,
    @Body() body: CreateDecisionChatMessageDto,
  ) {
    return this.decisionChatService.create(authorization, decisionId, body);
  }

  /** 查询单个授权范围内决策的事件时间线。 */
  @Get(':decisionId/events')
  @RequirePermissions('decision:read')
  @ApiOperation({ summary: '查询决策事件时间线' })
  listEvents(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('decisionId', ParseIntPipe) decisionId: number,
  ) {
    return this.decisionsService.listEvents(authorization, decisionId);
  }

  /** 将负责人管理的草稿决策推进到讨论阶段。 */
  @Patch(':decisionId/status')
  @RequirePermissions('decision:update')
  @ApiOperation({ summary: '开始决策讨论并写入状态变更事件' })
  updateStatus(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('decisionId', ParseIntPipe) decisionId: number,
    @Body() body: UpdateDecisionStatusDto,
  ) {
    return this.decisionsService.updateStatus(authorization, decisionId, body);
  }

  /** 查询负责人可以添加且尚未参与当前决策的用户。 */
  @Get(':decisionId/participant-candidates')
  @RequirePermissions('decision:update')
  @ApiOperation({ summary: '查询可以加入决策的参与者候选列表' })
  listParticipantCandidates(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('decisionId', ParseIntPipe) decisionId: number,
  ) {
    return this.decisionsService.listParticipantCandidates(
      authorization,
      decisionId,
    );
  }

  /** 向负责人管理的决策添加一名非负责人参与者。 */
  @Post(':decisionId/participants')
  @RequirePermissions('decision:update')
  @ApiOperation({ summary: '添加决策参与者并写入参与者事件' })
  addParticipant(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('decisionId', ParseIntPipe) decisionId: number,
    @Body() body: AddDecisionParticipantDto,
  ) {
    return this.decisionsService.addParticipant(
      authorization,
      decisionId,
      body,
    );
  }

  /** 查询单个授权范围内决策的提案列表。 */
  @Get(':decisionId/proposals')
  @RequirePermissions('decision:read')
  @ApiOperation({ summary: '查询决策提案列表' })
  listProposals(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('decisionId', ParseIntPipe) decisionId: number,
  ) {
    return this.decisionsService.listProposals(authorization, decisionId);
  }

  /** 在允许编辑的决策中创建开放提案。 */
  @Post(':decisionId/proposals')
  @RequirePermissions('decision:update')
  @ApiOperation({ summary: '创建决策提案并写入提案事件' })
  createProposal(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('decisionId', ParseIntPipe) decisionId: number,
    @Body() body: CreateDecisionProposalDto,
  ) {
    return this.decisionsService.createProposal(
      authorization,
      decisionId,
      body,
    );
  }

  /** 由负责人拒绝或取消开放提案，并终止该提案仍开放的投票。 */
  @Patch(':decisionId/proposals/:proposalId/status')
  @RequirePermissions('decision:update')
  @ApiOperation({ summary: '拒绝或取消开放提案' })
  closeProposal(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('decisionId', ParseIntPipe) decisionId: number,
    @Param('proposalId', ParseIntPipe) proposalId: number,
    @Body() body: CloseDecisionProposalDto,
  ) {
    return this.decisionsService.closeProposal(
      authorization,
      decisionId,
      proposalId,
      body,
    );
  }

  /** 查询单个授权范围内决策的投票轮次。 */
  @Get(':decisionId/vote-rounds')
  @RequirePermissions('decision:read')
  @ApiOperation({ summary: '查询决策投票轮次及公开统计' })
  listVoteRounds(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('decisionId', ParseIntPipe) decisionId: number,
  ) {
    return this.decisionsService.listVoteRounds(authorization, decisionId);
  }

  /** 为开放提案创建并立即开启一轮单选投票。 */
  @Post(':decisionId/vote-rounds')
  @RequirePermissions('decision:update')
  @ApiOperation({ summary: '创建并开启提案投票轮次' })
  createVoteRound(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('decisionId', ParseIntPipe) decisionId: number,
    @Body() body: CreateDecisionVoteRoundDto,
  ) {
    return this.decisionsService.createVoteRound(
      authorization,
      decisionId,
      body,
    );
  }

  /** 由具备审批身份的参与者提交一张单选选票。 */
  @Post(':decisionId/vote-rounds/:voteRoundId/ballots')
  @RequirePermissions('decision:read')
  @ApiOperation({ summary: '提交决策投票选票' })
  submitBallot(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('decisionId', ParseIntPipe) decisionId: number,
    @Param('voteRoundId', ParseIntPipe) voteRoundId: number,
    @Body() body: SubmitDecisionBallotDto,
  ) {
    return this.decisionsService.submitBallot(
      authorization,
      decisionId,
      voteRoundId,
      body,
    );
  }

  /** 由决策负责人关闭投票并固化最终统计。 */
  @Post(':decisionId/vote-rounds/:voteRoundId/close')
  @RequirePermissions('decision:update')
  @ApiOperation({ summary: '关闭决策投票并写入结果事件' })
  closeVoteRound(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('decisionId', ParseIntPipe) decisionId: number,
    @Param('voteRoundId', ParseIntPipe) voteRoundId: number,
  ) {
    return this.decisionsService.closeVoteRound(
      authorization,
      decisionId,
      voteRoundId,
    );
  }

  /** 查询单个授权范围内决策的正式决议列表。 */
  @Get(':decisionId/resolutions')
  @RequirePermissions('decision:read')
  @ApiOperation({ summary: '查询决策正式决议列表' })
  listResolutions(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('decisionId', ParseIntPipe) decisionId: number,
  ) {
    return this.decisionsService.listResolutions(authorization, decisionId);
  }

  /** 由负责人采纳开放提案、创建最终决议并收口整个决策。 */
  @Post(':decisionId/resolutions')
  @RequirePermissions('decision:update')
  @ApiOperation({ summary: '采纳提案并创建最终决议' })
  createResolution(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('decisionId', ParseIntPipe) decisionId: number,
    @Body() body: CreateDecisionResolutionDto,
  ) {
    return this.decisionsService.createResolution(
      authorization,
      decisionId,
      body,
    );
  }

  /** 查询单个授权范围内的决策详情。 */
  @Get(':decisionId')
  @RequirePermissions('decision:read')
  @ApiOperation({ summary: '查询决策详情' })
  get(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('decisionId', ParseIntPipe) decisionId: number,
  ) {
    return this.decisionsService.get(authorization, decisionId);
  }
}
