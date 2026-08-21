/**
 * 本文件提供只允许 BFF Agent Runtime 调用的窄只读工具接口。
 */

import {
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAuthorization } from '../../auth/decorators/current-authorization.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { AiRuntimeServiceGuard } from '../guards/ai-runtime-service.guard';
import { AiRuntimeQueryService } from '../services/ai-runtime-query.service';

@ApiTags('ai-runtime-tools')
@ApiBearerAuth()
@Controller('ai/runtime/runs/:runId/tools')
@UseGuards(AiRuntimeServiceGuard)
export class AiRuntimeToolController {
  /** 注入真实业务上下文查询服务。 */
  constructor(private readonly aiRuntimeQueryService: AiRuntimeQueryService) {}

  /** 返回当前 Thread 绑定且当前用户仍有权访问的决策基础上下文。 */
  @Get('decisions/:decisionId/context')
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '内部 getDecisionContext 只读工具' })
  getDecisionContext(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('runId') runId: string,
    @Param('decisionId', ParseIntPipe) decisionId: number,
    @Headers('x-ai-execution-lease-id') executionLeaseId: string,
  ) {
    return this.aiRuntimeQueryService.getDecisionContext(
      authorization,
      runId,
      executionLeaseId,
      decisionId,
    );
  }
}
