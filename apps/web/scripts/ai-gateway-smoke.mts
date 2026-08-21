/**
 * 本文件使用短提示对当前 standard 主模型执行显式 AI Gateway Smoke Test。
 * 缺少 Gateway 凭据时明确输出 SKIP；脚本不读取业务数据，也不打印 Prompt 正文。
 */

import { gateway } from '@ai-sdk/gateway';
import { generateText } from 'ai';

import { normalizeAiModelError } from '../src/features/ai/runtime/ai-model-error.ts';
import { getAiLanguageModelConfiguration } from '../src/features/ai/runtime/ai-model-registry.ts';
import { createAiGatewayProviderOptions } from '../src/features/ai/runtime/ai-model-request-options.ts';

/** Smoke Test 失败时允许输出的非敏感错误结构。 */
type SafeErrorDiagnostic = {
  /** 当前错误层的名称。 */
  name?: string;
  /** 当前错误层携带的 HTTP 状态码。 */
  statusCode?: number;
  /** Gateway 原始响应的顶层字段名，不包含字段值。 */
  responseKeys?: string[];
};

/** 运行一次低额度真实模型请求并输出不含正文的结果摘要。 */
async function main(): Promise<void> {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    console.info('[SKIP] 未检测到 AI_GATEWAY_API_KEY 或 VERCEL_OIDC_TOKEN，未调用真实 Gateway。');
    return;
  }

  const configuration = getAiLanguageModelConfiguration('standard');
  const result = await generateText({
    model: gateway(configuration.primary.modelId),
    prompt: '请只回复：NEXTNEST_GATEWAY_OK',
    maxOutputTokens: 128,
    maxRetries: 0,
    timeout: { totalMs: 30_000 },
    providerOptions: createAiGatewayProviderOptions(configuration, {
      userId: 'stage-one-smoke',
      feature: 'gateway-smoke',
    }),
  });

  if (!result.text.includes('NEXTNEST_GATEWAY_OK')) {
    throw new Error('Gateway Smoke Test 未返回预期标记。');
  }

  console.info('[PASS] AI Gateway Smoke Test 通过。', {
    configuredModelId: configuration.primary.modelId,
    actualModelId: result.response.modelId,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    finishReason: result.finishReason,
  });
}

/** 提取异常链中的名称、状态码和响应字段名，避免为了排错泄露正文或凭据。 */
function getSafeErrorDiagnostics(error: unknown): SafeErrorDiagnostic[] {
  const diagnostics: SafeErrorDiagnostic[] = [];
  let current = error;

  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const record = current as Record<string, unknown>;
    const response = record.response;

    diagnostics.push({
      name: typeof record.name === 'string' ? record.name : undefined,
      statusCode: typeof record.statusCode === 'number' ? record.statusCode : undefined,
      responseKeys:
        typeof response === 'object' && response !== null
          ? Object.keys(response as Record<string, unknown>)
          : undefined,
    });
    current = record.cause;
  }

  return diagnostics;
}

void main().catch((error: unknown) => {
  const normalized = normalizeAiModelError(error);

  console.error('[FAIL] AI Gateway Smoke Test 失败。', {
    code: normalized.code,
    status: normalized.status,
    retryable: normalized.retryable,
    message: normalized.message,
    diagnosticChain: getSafeErrorDiagnostics(error),
  });
  process.exitCode = 1;
});
