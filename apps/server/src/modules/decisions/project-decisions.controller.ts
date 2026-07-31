/**
 * 本文件提供以项目为父资源的决策列表、创建和详情接口。
 */
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAuthorization } from '../auth/decorators/current-authorization.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { AuthorizationContext } from '../auth/types/auth.types';
import { DecisionsService } from './decisions.service';
import { CreateDecisionDto } from './dto/create-decision.dto';

@ApiTags('project-decisions')
@ApiBearerAuth()
@Controller('projects/:projectId/decisions')
export class ProjectDecisionsController {
  /** 注入决策门面服务。 */
  constructor(private readonly decisionsService: DecisionsService) {}

  /** 查询指定项目下的全部正式决策。 */
  @Get()
  @RequirePermissions('decision:read')
  @ApiOperation({ summary: '查询项目决策列表' })
  list(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
  ) {
    return this.decisionsService.listProject(authorization, projectId);
  }

  /** 在指定项目中创建决策。 */
  @Post()
  @RequirePermissions('decision:create')
  @ApiOperation({ summary: '在项目中创建决策' })
  create(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: CreateDecisionDto,
  ) {
    return this.decisionsService.create(authorization, projectId, body);
  }

  /** 查询指定项目中的单项决策详情。 */
  @Get(':decisionId')
  @RequirePermissions('decision:read')
  @ApiOperation({ summary: '查询项目决策详情' })
  get(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('decisionId', ParseIntPipe) decisionId: number,
  ) {
    return this.decisionsService.getProjectDecision(
      authorization,
      projectId,
      decisionId,
    );
  }
}
