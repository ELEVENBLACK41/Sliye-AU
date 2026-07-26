/**
 * 本文件提供以议事为父资源的决策列表、创建和详情接口。
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

@ApiTags('matter-decisions')
@ApiBearerAuth()
@Controller('matters/:matterId/decisions')
export class MatterDecisionsController {
  /** 注入决策门面服务。 */
  constructor(private readonly decisionsService: DecisionsService) {}

  /** 查询指定议事下的全部正式决策。 */
  @Get()
  @RequirePermissions('decision:read')
  @ApiOperation({ summary: '查询议事决策列表' })
  list(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
  ) {
    return this.decisionsService.listMatter(authorization, matterId);
  }

  /** 在指定议事中创建决策。 */
  @Post()
  @RequirePermissions('decision:create')
  @ApiOperation({ summary: '在议事中创建决策' })
  create(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
    @Body() body: CreateDecisionDto,
  ) {
    return this.decisionsService.create(authorization, matterId, body);
  }

  /** 查询指定议事中的单项决策详情。 */
  @Get(':decisionId')
  @RequirePermissions('decision:read')
  @ApiOperation({ summary: '查询议事决策详情' })
  get(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('matterId', ParseIntPipe) matterId: number,
    @Param('decisionId', ParseIntPipe) decisionId: number,
  ) {
    return this.decisionsService.getMatterDecision(
      authorization,
      matterId,
      decisionId,
    );
  }
}
