/**
 * 本文件验证 C2 所需的官方 UI Message Stream、工具 parts、错误映射和断开消费语义。
 * 测试只使用 AI SDK Mock，不访问真实 Gateway、数据库或 NestJS。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgentUIStreamResponse, simulateReadableStream, smoothStream, type LanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

import {
  createNextNestWorkspaceAgentCore,
  type NextNestWorkspaceAgent,
} from '../agents/nextnest-workspace-agent.ts';
import type {
  NextNestWorkspaceToolInvocationInput,
  NextNestWorkspaceToolInvoker,
} from '../tools/decision/decision-agent-tool-context.ts';
import { normalizeAiModelError } from './ai-model-error.ts';

/** MockLanguageModelV4 使用的固定 Token 用量。 */
const MOCK_V4_USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

/** 构造一次 Mock 模型文本流结果。 */
function createMockTextStreamResult(text: string, modelId: string) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'stream-start' as const, warnings: [] },
        { type: 'response-metadata' as const, id: `${modelId}-response`, modelId },
        { type: 'text-start' as const, id: `${modelId}-text` },
        { type: 'text-delta' as const, id: `${modelId}-text`, delta: text },
        { type: 'text-end' as const, id: `${modelId}-text` },
        {
          type: 'finish' as const,
          finishReason: { unified: 'stop' as const, raw: 'stop' },
          usage: MOCK_V4_USAGE,
        },
      ],
    }),
  };
}

/** 构造一次 Mock 模型工具调用流结果。 */
function createMockToolStreamResult(toolCallId: string, modelId: string) {
  const input = JSON.stringify({ query: '年度预算调整' });

  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'stream-start' as const, warnings: [] },
        { type: 'response-metadata' as const, id: `${modelId}-response`, modelId },
        {
          type: 'tool-input-start' as const,
          id: toolCallId,
          toolName: 'findDecisionCandidates',
        },
        { type: 'tool-input-delta' as const, id: toolCallId, delta: input },
        { type: 'tool-input-end' as const, id: toolCallId },
        {
          type: 'tool-call' as const,
          toolCallId,
          toolName: 'findDecisionCandidates',
          input,
        },
        {
          type: 'finish' as const,
          finishReason: { unified: 'tool-calls' as const, raw: 'tool_calls' },
          usage: MOCK_V4_USAGE,
        },
      ],
    }),
  };
}

/** 构造可供 C2 测试使用的官方 Agent 核心。 */
function createTestAgent(model: LanguageModel, invokeTool: NextNestWorkspaceToolInvoker): NextNestWorkspaceAgent {
  return createNextNestWorkspaceAgentCore({
    requestId: 'req-c2-test',
    userId: 7,
    runId: 'run-c2-test',
    executionLeaseId: 'lease-c2-test',
    modelSettings: {
      model,
      maxOutputTokens: 8_192,
      maxRetries: 0,
      providerOptions: { gateway: { models: [], user: '7', tags: [] } },
      timeout: { totalMs: 240_000, stepMs: 180_000, chunkMs: 30_000 },
    },
    invokeTool,
  });
}

/** 把官方 SSE 文本转换为可断言的 UI Message Stream chunk。 */
function parseSseChunks(raw: string): Array<Record<string, unknown>> {
  return raw
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:') && line.slice('data:'.length).trim() !== '[DONE]')
    .map((line) => JSON.parse(line.slice('data:'.length)) as Record<string, unknown>);
}

/** 创建最小的用户 UIMessage 输入。 */
function createUserMessage(text: string) {
  return { id: 'user-c2-test', role: 'user' as const, parts: [{ type: 'text' as const, text }] };
}

test('官方 UI Message Stream 应输出工具 parts、文本增量和完成标记，不输出旧领域事件', async () => {
  const model = new MockLanguageModelV4({
    provider: 'nextnest.mock',
    modelId: 'c2-stream-model',
    doStream: [
      createMockToolStreamResult('find-1', 'c2-stream-model'),
      createMockTextStreamResult('已读取年度预算调整的决策上下文。', 'c2-stream-model'),
    ],
  });
  const invokeTool: NextNestWorkspaceToolInvoker = async (input) => ({
    status: 'SUCCEEDED',
    toolCallId: input.providerToolCallId,
    output: { candidates: [{ decisionId: 42, title: '年度预算调整' }] },
    events: [],
  });
  const agent = createTestAgent(model, invokeTool);

  const response = await createAgentUIStreamResponse({
    agent,
    uiMessages: [createUserMessage('请说明年度预算调整。')],
    headers: { 'X-NextNest-AI-Spike': 'c2' },
  });
  const raw = await response.text();
  const chunks = parseSseChunks(raw);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
  assert.equal(response.headers.get('X-NextNest-AI-Spike'), 'c2');
  assert.ok(chunks.some((chunk) => chunk.type === 'tool-input-available'));
  assert.ok(chunks.some((chunk) => chunk.type === 'tool-output-available'));
  assert.ok(chunks.some((chunk) => chunk.type === 'text-delta'));
  assert.ok(chunks.some((chunk) => chunk.type === 'finish'));
  assert.equal(raw.includes('live-delta'), false);
  assert.equal(raw.includes('ai-event'), false);
});

test('官方 UI Message Stream onEnd 应提供组装完成的 Assistant UIMessage', async () => {
  const model = new MockLanguageModelV4({
    provider: 'nextnest.mock',
    modelId: 'c4-c-on-end-model',
    doStream: createMockTextStreamResult('可持久化的完整回答。', 'c4-c-on-end-model'),
  });
  const agent = createTestAgent(
    model,
    async (_input: NextNestWorkspaceToolInvocationInput) => ({
      status: 'SUCCEEDED',
      toolCallId: 'unused',
      output: {},
      events: [],
    }),
  );
  let onEndResult:
    | {
        responseMessage: { role: string; parts: Array<{ type: string; text?: string }> };
        messages: Array<{ role: string }>;
        isAborted: boolean;
      }
    | undefined;

  const response = await createAgentUIStreamResponse({
    agent,
    uiMessages: [createUserMessage('测试 onEnd 持久化。')],
    onEnd: ({ responseMessage, messages, isAborted }) => {
      onEndResult = { responseMessage, messages, isAborted };
    },
  });

  await response.text();

  assert.equal(onEndResult?.isAborted, false);
  assert.equal(onEndResult?.messages.at(-1)?.role, 'assistant');
  const textPart = onEndResult?.responseMessage.parts.find((part) => part.type === 'text');
  assert.equal(textPart?.text, '可持久化的完整回答。');
});

test('AI SDK 官方 smoothStream 应把中文 burst 拆成多个连续 delta 且不丢失文本', async () => {
  const model = new MockLanguageModelV4({
    provider: 'nextnest.mock',
    modelId: 'c4-c-smooth-model',
    doStream: createMockTextStreamResult('哪一个方向的 AI 工作台更适合当前项目？', 'c4-c-smooth-model'),
  });
  const agent = createTestAgent(
    model,
    async (_input: NextNestWorkspaceToolInvocationInput) => ({
      status: 'SUCCEEDED',
      toolCallId: 'unused',
      output: {},
      events: [],
    }),
  );

  const response = await createAgentUIStreamResponse({
    agent,
    uiMessages: [createUserMessage('测试中文流平滑。')],
    experimental_transform: smoothStream({
      delayInMs: null,
      chunking: new Intl.Segmenter('zh-CN', { granularity: 'word' }),
    }),
  });
  const textDeltas = parseSseChunks(await response.text())
    .filter((chunk) => chunk.type === 'text-delta')
    .map((chunk) => String(chunk.delta ?? ''));

  assert.ok(textDeltas.length > 1);
  assert.equal(textDeltas.join(''), '哪一个方向的 AI 工作台更适合当前项目？');
});

test('UI Message Stream 错误应转换为脱敏的稳定中文错误 chunk', async () => {
  const model = new MockLanguageModelV4({
    provider: 'nextnest.mock',
    modelId: 'c2-error-model',
    doStream: async () => {
      throw new DOMException('供应商超时细节', 'TimeoutError');
    },
  });
  const agent = createTestAgent(model, async (_input: NextNestWorkspaceToolInvocationInput) => ({
    status: 'SUCCEEDED',
    toolCallId: 'unused',
    output: {},
    events: [],
  }));

  const response = await createAgentUIStreamResponse({
    agent,
    uiMessages: [createUserMessage('测试错误映射。')],
    onError: (error) => normalizeAiModelError(error).message,
  });
  const chunks = parseSseChunks(await response.text());
  const errorChunk = chunks.find((chunk) => chunk.type === 'error');

  assert.equal(errorChunk?.errorText, 'AI 响应超时，请稍后重试');
});

test('客户端取消响应后，服务端 consumeSseStream 副本仍可完成且不抛出未处理异常', async () => {
  const model = new MockLanguageModelV4({
    provider: 'nextnest.mock',
    modelId: 'c2-disconnect-model',
    doStream: createMockTextStreamResult('断开后由服务端副本继续消费。', 'c2-disconnect-model'),
  });
  const agent = createTestAgent(model, async (_input: NextNestWorkspaceToolInvocationInput) => ({
    status: 'SUCCEEDED',
    toolCallId: 'unused',
    output: {},
    events: [],
  }));
  let resolveConsumed!: () => void;
  const consumed = new Promise<void>((resolve) => {
    resolveConsumed = resolve;
  });

  const response = await createAgentUIStreamResponse({
    agent,
    uiMessages: [createUserMessage('测试客户端断开。')],
    consumeSseStream: async ({ stream }) => {
      try {
        await stream.pipeTo(new WritableStream<string>({ write() {} }));
      } finally {
        resolveConsumed();
      }
    },
  });
  const reader = response.body?.getReader();

  assert.ok(reader);
  await reader.read();
  await reader.cancel();
  await consumed;
});
