/*
 * @Description: 最小决策接口控制器，声明功能权限并交由 Service 执行数据范围。
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
import { CreateDecisionDto } from './dto/create-decision.dto';
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
