/**
 * 本文件暴露浏览器侧 AI 运行的事件补拉、停止与重试接口。
 * 事件接口只按服务端序号补拉已持久化事件，永不启动新的执行器；
 * 所有查询都以 Thread 所有者为条件，越权访问统一返回不存在。
 */

import { Controller, Get, Param, Post, Query, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAuthorization } from '../../auth/decorators/current-authorization.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { ListAiRunEventsQueryDto, RetryAiRunDto } from '../dto/ai-request.dto';
import { AiRunControlService } from '../services/ai-run-control.service';
import { AiRunQueryService } from '../services/ai-run-query.service';
import { AiRunService } from '../services/ai-run.service';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/runs')
export class AiRunController {
  /** 注入 Run 查询、控制与重试服务。 */
  constructor(
    private readonly runQueryService: AiRunQueryService,
    private readonly runControlService: AiRunControlService,
    private readonly runService: AiRunService,
  ) {}

  /** 按服务端事件序号补拉指定 Run 的新事件，并返回当前 Run 状态快照。 */
  @Get(':runId/events')
  @RequirePermissions('ai:chat:use')
  @ApiOperation({ summary: '按序号补拉 AI 运行事件' })
  listEvents(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('runId') runId: string,
    @Query() query: ListAiRunEventsQueryDto,
  ) {
    return this.runQueryService.listRunEvents(
      authorization.userId,
      query.threadId,
      runId,
      query.afterSequence ?? 0,
    );
  }

  /** 请求停止当前 Run；执行中的 Run 先失效租约，再等待取消确认或对账收敛。 */
  @Post(':runId/stop')
  @RequirePermissions('ai:chat:use')
  @ApiOperation({ summary: '请求停止当前 AI 运行' })
  stop(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('runId') runId: string,
  ) {
    return this.runControlService.requestStop({
      ownerUserId: authorization.userId,
      runId,
      cancellationReason: 'USER_REQUESTED',
    });
  }

  /** 从已取消或失败的 Run 创建关联的新 Run。 */
  @Post(':runId/retry')
  @RequirePermissions('ai:chat:use')
  @ApiOperation({ summary: '重试已结束的 AI 运行' })
  retry(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('runId') runId: string,
    @Body() body: RetryAiRunDto,
  ) {
    return this.runService.retryRun({
      ownerUserId: authorization.userId,
      runId,
      idempotencyKey: body.idempotencyKey,
    });
  }
}
