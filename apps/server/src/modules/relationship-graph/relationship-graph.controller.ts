/**
 * 本文件提供当前登录用户个人关系图谱快照的只读 HTTP 接口。
 */
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RelationshipGraphResponse } from '@workspace/contracts/relationship-graph';
import { CurrentAuthorization } from '../auth/decorators/current-authorization.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { AuthorizationContext } from '../auth/types/auth.types';
import { RelationshipGraphService } from './relationship-graph.service';

@ApiTags('relationship-graph')
@ApiBearerAuth()
@Controller('relationship-graph')
export class RelationshipGraphController {
  /** 注入个人关系图谱聚合服务。 */
  constructor(
    private readonly relationshipGraphService: RelationshipGraphService,
  ) {}

  /** 返回当前用户同时满足项目与决策读取权限后的完整图谱快照。 */
  @Get()
  @RequirePermissions('project:read', 'decision:read')
  @ApiOperation({ summary: '查询当前账号可见的个人关系图谱' })
  getGraph(
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<RelationshipGraphResponse> {
    return this.relationshipGraphService.getGraph(authorization);
  }
}
