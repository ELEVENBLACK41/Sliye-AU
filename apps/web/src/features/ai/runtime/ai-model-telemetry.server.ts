/**
 * 本文件记录不含 Prompt 和模型正文的 AI 模型运行摘要。
 * 第 2 阶段上线前暂时写入结构化服务端日志，后续再持久化到 AiRun/AiStep。
 */
import 'server-only';

import type { LanguageModelCallEndEvent } from 'ai';
import type { AiLanguageModelRole } from '@workspace/contracts/ai';

import { normalizeAiModelError } from './ai-model-error.ts';
import { estimateAiLanguageModelCostUsd } from './ai-model-registry.ts';

/** 记录一次真实语言模型调用的模型、用量、耗时和静态成本估算。 */
export function logAiLanguageModelCallEnd(options: {
  requestId: string;
  role: AiLanguageModelRole;
  configuredModelId: string;
  event: LanguageModelCallEndEvent;
}): void {
  const { requestId, role, configuredModelId, event } = options;

  console.info('[AI_MODEL_CALL_END]', {
    requestId,
    role,
    configuredModelId,
    actualModelId: event.modelId,
    provider: event.provider,
    responseId: event.responseId,
    finishReason: event.finishReason,
    inputTokens: event.usage.inputTokens,
    outputTokens: event.usage.outputTokens,
    estimatedCostUsd: estimateAiLanguageModelCostUsd(event.modelId, event.usage),
    responseTimeMs: event.performance.responseTimeMs,
    timeToFirstOutputMs: event.performance.timeToFirstOutputMs,
  });
}

/** 记录一条脱敏的模型流错误，原始错误仅作为本地日志参数保留。 */
export function logAiModelStreamError(requestId: string, role: AiLanguageModelRole, error: unknown): void {
  const normalized = normalizeAiModelError(error);

  console.error('[AI_MODEL_STREAM_ERROR]', {
    requestId,
    role,
    code: normalized.code,
    status: normalized.status,
    retryable: normalized.retryable,
    error,
  });
}

/** 记录浏览器断开、用户停止或超时触发的模型流取消。 */
export function logAiModelAbort(requestId: string, role: AiLanguageModelRole): void {
  console.info('[AI_MODEL_ABORT]', {
    requestId,
    role,
  });
}
