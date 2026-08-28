/**
 * 本文件验证第 1 阶段模型注册表、Gateway 参数、错误转换、Mock 流式输出、
 * 工具调用和取消行为，全部测试不访问真实模型，也不会产生费用。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateText, isStepCount, simulateReadableStream, streamText, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import { API_ERROR_CODES } from '@workspace/contracts/common';

import { normalizeAiModelError } from './ai-model-error.ts';
import {
  AiModelConfigurationError,
  estimateAiLanguageModelCostUsd,
  getAiEmbeddingModelConfiguration,
  getAiLanguageModelConfiguration,
  getAiModelRegistrySnapshot,
} from './ai-model-registry.ts';
import { createAiGatewayProviderOptions } from './ai-model-request-options.ts';

/** AI SDK V4 Mock 结果共用的确定性 Token 用量。 */
const MOCK_V4_USAGE = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 5,
    text: 5,
    reasoning: 0,
  },
};

test('五种角色应完整登记，standard 默认使用低成本 Nano 并只向 Mini 回退', () => {
  const snapshot = getAiModelRegistrySnapshot({});
  const standard = getAiLanguageModelConfiguration('standard', {});
  const deepReview = getAiLanguageModelConfiguration('deepReview', {});

  assert.deepEqual(Object.keys(snapshot).sort(), ['deepReview', 'embedding', 'reranker', 'router', 'standard']);
  assert.equal(standard.primary.modelId, 'openai/gpt-5.4-nano');
  assert.deepEqual(
    standard.fallbacks.map((profile) => profile.modelId),
    ['openai/gpt-5.4-mini'],
  );
  assert.equal(standard.primary.supportsTools, true);
  assert.deepEqual(standard.budget, {
    totalMs: 240_000,
    stepMs: 180_000,
    chunkMs: 30_000,
    maxOutputTokens: 8_192,
    maxRetries: 1,
  });
  assert.deepEqual(deepReview.budget, {
    totalMs: 270_000,
    stepMs: 240_000,
    chunkMs: 60_000,
    maxOutputTokens: 16_384,
    maxRetries: 1,
  });
});

test('环境变量只能切换到已登记且类型匹配的模型', () => {
  const standard = getAiLanguageModelConfiguration('standard', {
    AI_MODEL_STANDARD_ID: 'openai/gpt-5.4-mini',
  });

  assert.equal(standard.primary.modelId, 'openai/gpt-5.4-mini');
  assert.deepEqual(standard.fallbacks, []);
  assert.throws(
    () =>
      getAiEmbeddingModelConfiguration({
        AI_MODEL_EMBEDDING_ID: 'openai/gpt-5.4-nano',
      }),
    AiModelConfigurationError,
  );
  assert.throws(
    () =>
      getAiLanguageModelConfiguration('standard', {
        AI_MODEL_STANDARD_ID: 'provider/not-registered',
      }),
    AiModelConfigurationError,
  );
});

test('Gateway 参数应包含受控回退、用户归因和固定低基数标签', () => {
  const configuration = getAiLanguageModelConfiguration('standard', {});
  const options = createAiGatewayProviderOptions(
    configuration,
    {
      userId: 42,
      projectId: 7,
      feature: 'decision-agent',
    },
    'staging',
  );

  assert.deepEqual(options.gateway.models, ['openai/gpt-5.4-mini']);
  assert.equal(options.gateway.user, '42');
  assert.equal(options.gateway.quotaEntityId, '7');
  assert.deepEqual(options.gateway.tags, [
    'app:nextnest-web',
    'feature:decision-agent',
    'role:standard',
    'env:unknown',
  ]);
});

test('价格快照应按实际模型 ID 估算费用，未知模型不得伪造为零成本', () => {
  assert.equal(
    estimateAiLanguageModelCostUsd('openai/gpt-5.4-nano', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    }),
    1.45,
  );
  assert.equal(estimateAiLanguageModelCostUsd('provider/unknown', { inputTokens: 1 }), null);
});

test('MockLanguageModelV4 应确定性输出流式片段', async () => {
  const model = new MockLanguageModelV4({
    provider: 'nextnest.mock',
    modelId: 'mock-stream-model',
    doStream: {
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start', warnings: [] },
          { type: 'response-metadata', id: 'mock-response', modelId: 'mock-stream-model' },
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: '模型' },
          { type: 'text-delta', id: 'text-1', delta: '治理通过' },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: MOCK_V4_USAGE,
          },
        ],
      }),
    },
  });
  const result = streamText({
    model,
    prompt: '输出固定测试文本',
    maxRetries: 0,
  });

  assert.equal(await result.text, '模型治理通过');
  assert.equal(model.doStreamCalls.length, 1);
});

test('MockLanguageModelV4 应完成一次工具调用和后续回答', async () => {
  const model = new MockLanguageModelV4({
    provider: 'nextnest.mock',
    modelId: 'mock-tool-model',
    doGenerate: [
      {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'convert-1',
            toolName: 'convertFahrenheitToCelsius',
            input: JSON.stringify({ temperature: 68 }),
          },
        ],
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage: MOCK_V4_USAGE,
        warnings: [],
      },
      {
        content: [{ type: 'text', text: '68 华氏度约等于 20 摄氏度。' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: MOCK_V4_USAGE,
        warnings: [],
      },
    ],
  });
  const result = await generateText({
    model,
    prompt: '把 68 华氏度换算成摄氏度',
    maxRetries: 0,
    stopWhen: isStepCount(2),
    tools: {
      convertFahrenheitToCelsius: tool({
        description: '把华氏温度转换为摄氏温度',
        inputSchema: z.object({ temperature: z.number() }),
        execute: async ({ temperature }) => ({
          celsius: Math.round((temperature - 32) * (5 / 9)),
        }),
      }),
    },
  });

  assert.equal(result.text, '68 华氏度约等于 20 摄氏度。');
  assert.equal(model.doGenerateCalls.length, 2);
});

test('取消信号应终止 Mock 调用并转换为稳定取消错误', async () => {
  const controller = new AbortController();
  const model = new MockLanguageModelV4({
    provider: 'nextnest.mock',
    modelId: 'mock-abort-model',
    doGenerate: async ({ abortSignal }) =>
      await new Promise<never>((_resolve, reject) => {
        const rejectWithAbort = () => reject(abortSignal?.reason ?? new DOMException('请求已取消', 'AbortError'));

        if (abortSignal?.aborted) {
          rejectWithAbort();
          return;
        }

        abortSignal?.addEventListener('abort', rejectWithAbort, { once: true });
      }),
  });
  const pending = generateText({
    model,
    prompt: '等待取消',
    abortSignal: controller.signal,
    maxRetries: 0,
  });

  controller.abort(new DOMException('用户停止请求', 'AbortError'));

  await assert.rejects(pending, (error: unknown) => {
    assert.equal(normalizeAiModelError(error).code, API_ERROR_CODES.AI_MODEL_CANCELLED);
    return true;
  });
});

test('供应商状态、超时和配置错误应转换为稳定业务码', () => {
  assert.equal(normalizeAiModelError({ statusCode: 429 }).code, API_ERROR_CODES.AI_MODEL_RATE_LIMITED);
  assert.equal(
    normalizeAiModelError({ cause: new DOMException('超时', 'TimeoutError') }).code,
    API_ERROR_CODES.AI_MODEL_TIMEOUT,
  );
  assert.equal(
    normalizeAiModelError(new AiModelConfigurationError('测试配置错误')).code,
    API_ERROR_CODES.AI_MODEL_CONFIGURATION_INVALID,
  );
});
