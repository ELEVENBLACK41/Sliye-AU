/**
 * 本文件声明新版工作台的只读摘要与洞察接口。
 */
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAuthorization } from '../auth/decorators/current-authorization.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { AuthorizationContext } from '../auth/types/auth.types';
import { DashboardQueryService } from './dashboard-query.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  /** 注入工作台只读聚合查询服务。 */
  constructor(private readonly queryService: DashboardQueryService) {}

  /** 查询当前用户的参与统计与决策状态摘要。 */
  @Get('summary')
  @RequirePermissions('dashboard:access')
  @ApiOperation({ summary: '查询工作台个人摘要' })
  getSummary(@CurrentAuthorization() authorization: AuthorizationContext) {
    return this.queryService.getSummary(authorization);
  }

  /** 查询工作台趋势、提案、项目与进行中决策洞察。 */
  @Get('insights')
  @RequirePermissions('dashboard:access')
  @ApiOperation({ summary: '查询工作台业务洞察' })
  getInsights(@CurrentAuthorization() authorization: AuthorizationContext) {
    return this.queryService.getInsights(authorization);
  }
}
