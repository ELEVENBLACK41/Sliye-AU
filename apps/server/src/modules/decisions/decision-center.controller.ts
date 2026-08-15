/**
 * 本文件声明决策中心的只读聚合接口，并统一应用决策读取权限。
 */
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAuthorization } from '../auth/decorators/current-authorization.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { AuthorizationContext } from '../auth/types/auth.types';
import { ListDecisionCenterArchiveDto } from './dto/list-decision-center-archive.dto';
import { DecisionCenterQueryService } from './services/decision-center-query.service';

@ApiTags('decision-center')
@ApiBearerAuth()
@Controller('decision-center')
export class DecisionCenterController {
  /** 注入决策中心只读查询服务。 */
  constructor(private readonly queryService: DecisionCenterQueryService) {}

  /** 查询最近一年的决策活动热力图。 */
  @Get('activity')
  @RequirePermissions('decision:read')
  @ApiOperation({ summary: '查询决策中心活动热力图' })
  getActivity(@CurrentAuthorization() authorization: AuthorizationContext) {
    return this.queryService.getActivity(authorization);
  }

  /** 查询热力图中某一天的过程档案。 */
  @Get('activity/:date')
  @RequirePermissions('decision:read')
  @ApiOperation({ summary: '查询指定日期的决策过程档案' })
  getActivityDay(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('date') date: string,
  ) {
    return this.queryService.getActivityDay(authorization, date);
  }

  /** 查询跨项目决策过程指标与观察。 */
  @Get('analytics')
  @RequirePermissions('decision:read')
  @ApiOperation({ summary: '查询决策过程分析' })
  getAnalytics(@CurrentAuthorization() authorization: AuthorizationContext) {
    return this.queryService.getAnalytics(authorization);
  }

  /** 查询当前用户可见的跨项目决策档案。 */
  @Get('archive')
  @RequirePermissions('decision:read')
  @ApiOperation({ summary: '查询跨项目决策档案' })
  getArchive(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Query() query: ListDecisionCenterArchiveDto,
  ) {
    return this.queryService.getArchive(authorization, query);
  }
}
