/**
 * 本文件提供用户停止/重试和 BFF Agent Runtime 的受保护执行写入接口。
 */

import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentAuthorization } from '../../auth/decorators/current-authorization.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import {
  AppendAiTextDeltaDto,
  ClaimAiRunExecutionDto,
  CompleteAiRunExecutionDto,
  ConfirmAiRunCancellationDto,
  FailAiRunExecutionDto,
  RecordAiModelStepDto,
  RenewAiRunExecutionDto,
  RetryAiRunDto,
  StartAiToolCallDto,
  FinishAiToolCallDto,
} from '../dto/ai-request.dto';
import { AiRuntimeServiceGuard } from '../guards/ai-runtime-service.guard';
import { AiEventService } from '../services/ai-event.service';
import { AiRunLeaseService } from '../services/ai-run-lease.service';
import { AiRunService } from '../services/ai-run.service';
import { AiRuntimeQueryService } from '../services/ai-runtime-query.service';
import { AiStepService } from '../services/ai-step.service';
import { AiThreadService } from '../services/ai-thread.service';
import { AiToolCallService } from '../services/ai-tool-call.service';

@ApiTags('ai-runs')
@ApiBearerAuth()
@Controller('ai/runs')
export class AiRunController {
  /** 注入 Run 生命周期、租约、事件、Step 和权限复核服务。 */
  constructor(
    private readonly aiThreadService: AiThreadService,
    private readonly aiRunLeaseService: AiRunLeaseService,
    private readonly aiRunService: AiRunService,
    private readonly aiRuntimeQueryService: AiRuntimeQueryService,
    private readonly aiEventService: AiEventService,
    private readonly aiStepService: AiStepService,
    private readonly aiToolCallService: AiToolCallService,
  ) {}

  /** BFF 在候选确认后恢复启动同一排队 Run 所需的权威状态。 */
  @Get(':runId/execution/preparation')
  @UseGuards(AiRuntimeServiceGuard)
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '内部执行器恢复 AI Run 启动上下文' })
  getExecutionPreparation(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('runId') runId: string,
  ) {
    return this.aiRuntimeQueryService.getRunExecutionPreparation(
      authorization,
      runId,
    );
  }

  /** 用户请求停止排队或执行中的 Run。 */
  @Post(':runId/stop')
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '请求停止 AI Run' })
  stop(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('runId') runId: string,
  ) {
    return this.aiRunService.requestCancellation({ authorization, runId });
  }

  /** 从失败或取消的旧 Run 幂等创建新 Run。 */
  @Post(':runId/retry')
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '重试失败或取消的 AI Run' })
  retry(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('runId') runId: string,
    @Body() body: RetryAiRunDto,
  ) {
    return this.aiThreadService.retryRun({
      authorization,
      runId,
      clientRequestId: body.clientRequestId,
    });
  }

  /** BFF 执行器原子领取排队 Run 并取得 fencing 租约。 */
  @Post(':runId/execution/claim')
  @UseGuards(AiRuntimeServiceGuard)
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '内部执行器领取 AI Run' })
  async claim(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('runId') runId: string,
    @Body() body: ClaimAiRunExecutionDto,
  ) {
    return this.aiRunLeaseService.claim({
      authorization,
      runId,
      leaseDurationMs: body.leaseDurationMs,
    });
  }

  /** BFF 执行器续租当前 fencing 租约。 */
  @Post(':runId/execution/renew')
  @UseGuards(AiRuntimeServiceGuard)
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '内部执行器续租 AI Run' })
  async renew(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('runId') runId: string,
    @Body() body: RenewAiRunExecutionDto,
  ) {
    return this.aiRunLeaseService.renewLease({ authorization, runId, ...body });
  }

  /** BFF 执行器在租约保护下追加助手文本事件。 */
  @Post(':runId/execution/text-deltas')
  @UseGuards(AiRuntimeServiceGuard)
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '内部执行器追加 AI 文本事件' })
  async appendTextDelta(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('runId') runId: string,
    @Body() body: AppendAiTextDeltaDto,
  ) {
    return this.aiEventService.append({
      authorization,
      runId,
      executionLeaseId: body.executionLeaseId,
      type: 'ASSISTANT_TEXT_DELTA',
      data: { messageId: body.messageId, delta: body.delta },
    });
  }

  /** BFF 执行器持久化一次实际模型调用和 Token/成本。 */
  @Post(':runId/execution/steps')
  @UseGuards(AiRuntimeServiceGuard)
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '内部执行器记录 AI 模型 Step' })
  async recordStep(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('runId') runId: string,
    @Body() body: RecordAiModelStepDto,
  ) {
    return this.aiStepService.recordModelStep({
      authorization,
      ...body,
      runId,
      startedAt: new Date(body.startedAt),
      finishedAt: new Date(body.finishedAt),
    });
  }

  /** BFF 执行器写入助手消息并完成 Run。 */
  @Post(':runId/execution/complete')
  @UseGuards(AiRuntimeServiceGuard)
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '内部执行器完成 AI Run' })
  async complete(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('runId') runId: string,
    @Body() body: CompleteAiRunExecutionDto,
  ) {
    return this.aiRunService.complete({ authorization, runId, ...body });
  }

  /** BFF 执行器把运行中 Run 收敛为失败终态。 */
  @Post(':runId/execution/fail')
  @UseGuards(AiRuntimeServiceGuard)
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '内部执行器标记 AI Run 失败' })
  async fail(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('runId') runId: string,
    @Body() body: FailAiRunExecutionDto,
  ) {
    return this.aiRunService.fail({ authorization, runId, ...body });
  }

  /** BFF 执行器确认 Abort 已生效并写入取消终态。 */
  @Post(':runId/execution/confirm-cancellation')
  @UseGuards(AiRuntimeServiceGuard)
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '内部执行器确认 AI Run 已取消' })
  async confirmCancellation(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('runId') runId: string,
    @Body() body: ConfirmAiRunCancellationDto,
  ) {
    return this.aiRunService.confirmCancellation({
      authorization,
      runId,
      ...body,
    });
  }

  /** BFF 执行器在真正调用工具前写入安全输入审计。 */
  @Post(':runId/execution/tool-calls/start')
  @UseGuards(AiRuntimeServiceGuard)
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '内部执行器开始 AI 工具调用' })
  async startToolCall(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('runId') runId: string,
    @Body() body: StartAiToolCallDto,
  ) {
    return this.aiToolCallService.start({ authorization, runId, ...body });
  }

  /** BFF 执行器在工具结束后写入结果摘要或稳定错误。 */
  @Post(':runId/execution/tool-calls/finish')
  @UseGuards(AiRuntimeServiceGuard)
  @RequirePermissions('ai:chat:use', 'decision:read')
  @ApiOperation({ summary: '内部执行器完成 AI 工具调用' })
  async finishToolCall(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('runId') runId: string,
    @Body() body: FinishAiToolCallDto,
  ) {
    return this.aiToolCallService.finish({ authorization, runId, ...body });
  }
}
