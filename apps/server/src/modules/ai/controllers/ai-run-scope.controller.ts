/**
 * 本文件提供授权决策发现、Run 范围查询和候选确认接口。
 */

import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAuthorization } from '../../auth/decorators/current-authorization.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import {
  ConfirmAiRunScopeDto,
  DiscoverAiRunScopeDto,
  SearchAccessibleDecisionsDto,
} from '../dto/ai-scope-request.dto';
import { AiRunScopeService } from '../services/ai-run-scope.service';

@ApiTags('ai-run-scope')
@ApiBearerAuth()
@Controller('ai')
export class AiRunScopeController {
  /** 注入 Run 动态授权范围服务。 */
  constructor(private readonly aiRunScopeService: AiRunScopeService) {}

  /** 返回经过数据库对象级权限过滤的少量决策候选。 */
  @Post('scope/decisions/search')
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '按用户问题搜索当前账号可访问的决策候选' })
  searchAccessibleDecisions(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Body() body: SearchAccessibleDecisionsDto,
  ) {
    return this.aiRunScopeService.searchAccessibleDecisions(
      authorization,
      body.query,
      body.limit,
    );
  }

  /** 返回指定 Run 当前权威范围解析状态。 */
  @Get('runs/:runId/scope')
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '查询 AI Run 的动态授权范围' })
  getRunScope(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('runId') runId: string,
  ) {
    return this.aiRunScopeService.getRunScope(authorization, runId);
  }

  /** 按当前用户问题为尚未执行的 Run 发现精确范围或候选。 */
  @Post('runs/:runId/scope/discover')
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '发现 AI Run 的授权决策范围' })
  discoverRunScope(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('runId') runId: string,
    @Body() body: DiscoverAiRunScopeDto,
  ) {
    return this.aiRunScopeService.discoverRunScope(
      authorization,
      runId,
      body.query,
    );
  }

  /** 对用户选择的候选重新鉴权并固化一个或多个决策范围。 */
  @Post('runs/:runId/scope/confirm')
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '确认 AI Run 的一个或多个决策候选' })
  confirmRunScope(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('runId') runId: string,
    @Body() body: ConfirmAiRunScopeDto,
  ) {
    return this.aiRunScopeService.confirmRunScope(
      authorization,
      runId,
      body.decisionIds,
    );
  }
}
