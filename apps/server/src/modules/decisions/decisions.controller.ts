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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAuthorization } from '../auth/decorators/current-authorization.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { AuthorizationContext } from '../auth/types/auth.types';
import { AddDecisionParticipantDto } from './dto/add-decision-participant.dto';
import { CreateDecisionDto } from './dto/create-decision.dto';
import { CreateDecisionProposalDto } from './dto/create-decision-proposal.dto';
import { UpdateDecisionStatusDto } from './dto/update-decision-status.dto';
import { DecisionsService } from './decisions.service';

@ApiTags('decisions')
@ApiBearerAuth()
@Controller('decisions')
export class DecisionsController {
  /** 注入决策业务服务。 */
  constructor(private readonly decisionsService: DecisionsService) {}

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
