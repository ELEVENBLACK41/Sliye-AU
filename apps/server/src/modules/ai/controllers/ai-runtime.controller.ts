/**
 * 本文件暴露只允许内部 Agent Runtime 调用的执行接口。
 * 这些接口由共享密钥守卫保护，浏览器不得直接访问；
 * 用户身份、业务范围和工具权限全部由服务端从持久化 Run 现取现算。
 */

import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { ApiErrorCode } from '@workspace/contracts/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { Public } from '../../auth/decorators/public.decorator';
import type { Prisma } from '../../../generated/prisma';
import {
  AppendAiAssistantTextDto,
  AiRuntimeLeaseDto,
  CompleteAiRunDto,
  InvokeAiToolDto,
  RecordAiStepDto,
} from '../dto/ai-runtime.dto';
import { AiRuntimeServiceGuard } from '../guards/ai-runtime-service.guard';
import { AiRuntimeSessionService } from '../services/ai-runtime-session.service';

/** 服务端已知的稳定错误码集合，用于校验 Runtime 回传的失败码。 */
const KNOWN_API_ERROR_CODES = new Set<string>(Object.values(API_ERROR_CODES));

@ApiExcludeController()
@Public()
@UseGuards(AiRuntimeServiceGuard)
@Controller('internal/ai/runs')
export class AiRuntimeController {
  /** 注入内部执行会话服务。 */
  constructor(
    private readonly runtimeSessionService: AiRuntimeSessionService,
  ) {}

  /** 收敛过期租约，并返回需要由当前 Runtime 启动的后续排队 Run。 */
  @Post('reconcile')
  reconcileExpiredRuns() {
    return this.runtimeSessionService.reconcileExpiredRuns();
  }

  /** 原子领取一个排队 Run，并返回受限上下文与可用工具目录；已被领取时返回 null。 */
  @Post(':runId/claim')
  claim(@Param('runId') runId: string) {
    return this.runtimeSessionService.startSession(runId);
  }

  /** 延长当前执行器租约；租约失效说明用户已停止或已被对账收敛。 */
  @Post(':runId/lease/renew')
  async renewLease(
    @Param('runId') runId: string,
    @Body() body: AiRuntimeLeaseDto,
  ) {
    const executionLeaseExpiresAt = await this.runtimeSessionService.renewLease(
      runId,
      body.executionLeaseId,
    );

    return { executionLeaseExpiresAt: executionLeaseExpiresAt.toISOString() };
  }

  /** 确保当前 Run 已有助手消息占位，供文本增量事件引用稳定标识。 */
  @Post(':runId/assistant-message')
  ensureAssistantMessage(
    @Param('runId') runId: string,
    @Body() body: AiRuntimeLeaseDto,
  ) {
    return this.runtimeSessionService.ensureAssistantMessage(
      runId,
      body.executionLeaseId,
    );
  }

  /** 追加一条助手文本增量事件。 */
  @Post(':runId/events/assistant-text')
  appendAssistantText(
    @Param('runId') runId: string,
    @Body() body: AppendAiAssistantTextDto,
  ) {
    return this.runtimeSessionService.appendAssistantTextDelta({
      runId,
      executionLeaseId: body.executionLeaseId,
      messageId: body.messageId,
      delta: body.delta,
      liveDeltaIds: body.liveDeltaIds,
      liveSequenceStart: body.liveSequenceStart,
      liveSequenceEnd: body.liveSequenceEnd,
    });
  }

  /** 记录一次模型步骤的受控元数据与 Token 摘要。 */
  @Post(':runId/steps')
  recordStep(@Param('runId') runId: string, @Body() body: RecordAiStepDto) {
    return this.runtimeSessionService.recordStep({
      runId,
      executionLeaseId: body.executionLeaseId,
      sequence: body.sequence,
      resolvedModelId: body.resolvedModelId ?? null,
      finishReason: body.finishReason ?? null,
      inputTokens: body.inputTokens ?? null,
      outputTokens: body.outputTokens ?? null,
      totalTokens: body.totalTokens ?? null,
      startedAt: new Date(body.startedAt),
      finishedAt: new Date(body.finishedAt),
      providerToolCallIds: body.providerToolCallIds,
    });
  }

  /** 执行一次只读工具调用；失败同样返回可交回模型的稳定说明。 */
  @Post(':runId/tool-calls')
  invokeTool(@Param('runId') runId: string, @Body() body: InvokeAiToolDto) {
    return this.runtimeSessionService.invokeTool(runId, body.executionLeaseId, {
      providerToolCallId: body.providerToolCallId,
      toolName: body.toolName,
      input: body.input,
    });
  }

  /** 把 Run 收敛为完成或失败终态，并写入助手 UIMessage 与用量。 */
  @Post(':runId/complete')
  complete(@Param('runId') runId: string, @Body() body: CompleteAiRunDto) {
    return this.runtimeSessionService.completeRun({
      runId,
      executionLeaseId: body.executionLeaseId,
      status: body.status,
      failureReason: body.failureReason ?? null,
      failureCode: this.toKnownErrorCode(body.failureCode),
      assistantMessageContent: body.assistantMessageContent ?? null,
      assistantMessageParts: body.assistantMessageParts as
        | Prisma.InputJsonValue
        | undefined,
      assistantMessageMetadata: body.assistantMessageMetadata as
        | Prisma.InputJsonValue
        | undefined,
      resolvedModelId: body.resolvedModelId ?? null,
      usage: body.usage ? { ...body.usage } : null,
    });
  }

  /** 执行器已停止写入后确认取消，把取消请求唯一收敛为 CANCELLED。 */
  @Post(':runId/cancel-confirm')
  confirmCancellation(@Param('runId') runId: string) {
    return this.runtimeSessionService.confirmCancellation(runId);
  }

  /** 只接受服务端已知的稳定错误码，未知取值统一归一化为内部错误。 */
  private toKnownErrorCode(failureCode?: string): ApiErrorCode | null {
    if (!failureCode) {
      return null;
    }

    return KNOWN_API_ERROR_CODES.has(failureCode)
      ? (failureCode as ApiErrorCode)
      : API_ERROR_CODES.COMMON_INTERNAL_ERROR;
  }
}
