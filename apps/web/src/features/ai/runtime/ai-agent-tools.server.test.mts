/**
 * 本文件验证 Web 动态工具桥的请求生命周期和安全边界。
 * 测试只模拟 NestJS 内部响应，不连接真实服务、数据库或模型。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { AiRuntimeToolDescriptor } from '@workspace/contracts/ai';

import { buildAiAgentTools } from './ai-agent-tools.server.ts';

/** 测试用的 Runtime 服务 Token，确保请求能够进入内部客户端。 */
const TEST_RUNTIME_TOKEN = 't'.repeat(32);

/** 创建一项包含治理元数据的动态工具描述。 */
function createDescriptor(timeoutMs = 100): AiRuntimeToolDescriptor {
  return {
    name: 'testReadableTool',
    description: '读取一项测试用业务摘要。',
    accessMode: 'READ',
    timeoutMs,
    presentation: {
      displayName: '读取测试摘要',
    },
    governance: {
      riskLevel: 'L0',
      sourceTypes: ['DECISION'],
      resultLimit: {
        maxItems: 5,
      },
      retryPolicy: {
        maxRetries: 0,
      },
      parallelPolicy: 'ALLOW',
    },
    input: {
      description: '测试工具输入。',
      fields: [
        {
          name: 'query',
          valueType: 'STRING',
          required: true,
          description: '测试查询词。',
        },
      ],
    },
    output: {
      description: '测试工具输出。',
      fields: [
        {
          name: 'summary',
          valueType: 'STRING',
          required: true,
          description: '受控摘要。',
        },
      ],
    },
  };
}

/** 在一个测试回合内设置服务 Token，并确保结束后恢复进程环境。 */
async function withRuntimeToken<T>(callback: () => Promise<T>): Promise<T> {
  const previousToken = process.env.AI_RUNTIME_SERVICE_TOKEN;
  const previousNestBaseUrl = process.env.NEST_BASE_URL;
  const previousNestApiPrefix = process.env.NEST_API_PREFIX;
  process.env.AI_RUNTIME_SERVICE_TOKEN = TEST_RUNTIME_TOKEN;
  process.env.NEST_BASE_URL = 'http://nest.test';
  process.env.NEST_API_PREFIX = '';

  try {
    return await callback();
  } finally {
    if (previousToken === undefined) {
      delete process.env.AI_RUNTIME_SERVICE_TOKEN;
    } else {
      process.env.AI_RUNTIME_SERVICE_TOKEN = previousToken;
    }
    if (previousNestBaseUrl === undefined) {
      delete process.env.NEST_BASE_URL;
    } else {
      process.env.NEST_BASE_URL = previousNestBaseUrl;
    }
    if (previousNestApiPrefix === undefined) {
      delete process.env.NEST_API_PREFIX;
    } else {
      process.env.NEST_API_PREFIX = previousNestApiPrefix;
    }
  }
}

/** 调用测试动态工具并收窄其必需的执行函数。 */
async function executeTestTool(descriptor: AiRuntimeToolDescriptor, abortSignal?: AbortSignal): Promise<unknown> {
  const tools = buildAiAgentTools([descriptor], {
    runId: 'run-1',
    executionLeaseId: 'lease-1',
  });
  const tool = tools[descriptor.name];

  if (!tool?.execute) {
    throw new Error('测试工具没有可执行函数');
  }

  return tool.execute(
    { query: 'redis' },
    {
      toolCallId: 'tool-call-1',
      messages: [],
      abortSignal,
      context: {},
    },
  );
}

/** 创建 NestJS 统一成功响应，供内部请求客户端解析。 */
function createSuccessResponse(data: unknown): Response {
  return new Response(
    JSON.stringify({
      success: true,
      code: 'COMMON.OK',
      message: 'ok',
      data,
      timestamp: Date.now(),
      requestId: 'request-1',
      path: '/internal/ai/runs/run-1/tool-calls',
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
}

/** 创建 NestJS 统一失败响应，供安全错误映射测试使用。 */
function createFailureResponse(): Response {
  return new Response(
    JSON.stringify({
      success: false,
      code: 'AI.INTERNAL_FAILURE',
      message: '内部租约和服务 Token 不应暴露给模型',
      data: null,
      timestamp: Date.now(),
      requestId: 'request-1',
      path: '/internal/ai/runs/run-1/tool-calls',
    }),
    {
      status: 500,
      headers: { 'content-type': 'application/json' },
    },
  );
}

/** 保存并替换全局 fetch，测试结束后恢复原始实现。 */
async function withMockFetch<T>(fetchMock: typeof fetch, callback: () => Promise<T>): Promise<T> {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fetchMock;

  try {
    return await callback();
  } finally {
    globalThis.fetch = previousFetch;
  }
}

test('动态工具把内部请求结果转换为模型可用的窄输出，并携带服务端凭据', async () => {
  await withRuntimeToken(() =>
    withMockFetch(
      async (_input, init) => {
        assert.equal(new Headers(init?.headers).get('x-ai-runtime-token'), TEST_RUNTIME_TOKEN);
        assert.ok(init?.signal);
        assert.deepEqual(JSON.parse(String(init?.body)), {
          executionLeaseId: 'lease-1',
          providerToolCallId: 'tool-call-1',
          toolName: 'testReadableTool',
          input: { query: 'redis' },
        });

        return createSuccessResponse({
          status: 'SUCCEEDED',
          output: { summary: '工具已执行' },
          events: [],
        });
      },
      async () => {
        const result = await executeTestTool(createDescriptor());
        assert.deepEqual(result, {
          ok: true,
          data: { summary: '工具已执行' },
        });
      },
    ),
  );
});

test('动态工具不会把权限、Token 或租约信息拼入模型工具描述', () => {
  const tool = buildAiAgentTools([createDescriptor()], {
    runId: 'run-1',
    executionLeaseId: 'lease-1',
  }).testReadableTool;

  const description = typeof tool.description === 'function' ? tool.description({ context: {} }) : tool.description;

  assert.equal(typeof description, 'string');
  if (typeof description !== 'string') {
    throw new Error('测试工具描述未解析为字符串');
  }

  assert.equal(description.includes('decision:read'), false);
  assert.equal(description.includes('x-ai-runtime-token'), false);
  assert.equal(description.includes('lease-1'), false);
});

test('正式 Agent 始终提供由模型自行决定是否调用的 Gateway 网页检索工具', () => {
  const webSearch = buildAiAgentTools([], {
    runId: 'run-1',
    executionLeaseId: 'lease-1',
  }).parallel_search;

  assert.ok(webSearch);
  assert.equal(webSearch.type, 'provider');
  assert.equal('id' in webSearch ? webSearch.id : null, 'gateway.parallel_search');
  assert.deepEqual('args' in webSearch ? webSearch.args : null, {
    mode: 'agentic',
    maxResults: 5,
    excerpts: {
      maxCharsPerResult: 800,
      maxCharsTotal: 4_000,
    },
  });
});

test('动态工具把上游 abortSignal 传递给 Nest 请求并保留取消语义', async () => {
  const controller = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  let fetchAborted = false;

  await withRuntimeToken(() =>
    withMockFetch(
      async (_input, init) => {
        receivedSignal = init?.signal ?? undefined;

        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              fetchAborted = true;
              reject(init.signal?.reason);
            },
            { once: true },
          );
        });
      },
      async () => {
        const execution = executeTestTool(createDescriptor(), controller.signal);
        await new Promise((resolve) => setTimeout(resolve, 0));
        controller.abort(new DOMException('用户停止', 'AbortError'));

        await assert.rejects(execution, (error: unknown) => {
          return error instanceof DOMException && error.name === 'AbortError';
        });
        assert.equal(receivedSignal?.aborted, true);
        assert.equal(fetchAborted, true);
      },
    ),
  );
});

test('动态工具超时后返回安全失败说明，不把内部错误交给模型', async () => {
  let fetchAborted = false;

  const result = await withRuntimeToken(() =>
    withMockFetch(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              fetchAborted = true;
              reject(init.signal?.reason);
            },
            { once: true },
          );
        }),
      () => executeTestTool(createDescriptor(10)),
    ),
  );

  assert.deepEqual(result, {
    ok: false,
    error: '工具执行超时，请稍后重试或缩小查询范围。',
  });
  assert.equal(fetchAborted, true);
});

test('动态工具把普通内部失败转换为通用安全说明', async () => {
  const result = await withRuntimeToken(() =>
    withMockFetch(
      async () => createFailureResponse(),
      () => executeTestTool(createDescriptor()),
    ),
  );

  assert.deepEqual(result, {
    ok: false,
    error: '工具暂时不可用，请稍后重试或改用其他方式回答。',
  });
});
