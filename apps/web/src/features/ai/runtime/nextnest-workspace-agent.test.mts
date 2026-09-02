/**
 * 本文件验证 C1 官方 Workspace Agent 的工具契约、步骤循环和服务端上下文传递。
 * 所有模型与 NestJS 工具调用都使用 Mock，不访问真实模型、数据库或内部 HTTP 接口。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MockLanguageModelV4 } from 'ai/test';

import type { AiRuntimeToolInvocationResult } from '@workspace/contracts/ai';

import {
  createNextNestWorkspaceAgentCore,
  NEXTNEST_WORKSPACE_AGENT_ID,
  NEXTNEST_WORKSPACE_AGENT_MAX_STEPS,
  type NextNestWorkspaceAgentRuntimeContext,
} from '../agents/nextnest-workspace-agent.ts';
import type {
  NextNestWorkspaceToolInvocationInput,
  NextNestWorkspaceToolInvoker,
} from '../tools/decision/decision-agent-tool-context.ts';

/** MockLanguageModelV4 使用的固定 Token 用量。 */
const MOCK_V4_USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

/** 构造一次 Mock 模型工具调用结果。 */
function createMockToolCall(toolCallId: string, toolName: string, input: unknown) {
  return {
    content: [
      {
        type: 'tool-call' as const,
        toolCallId,
        toolName,
        input: JSON.stringify(input),
      },
    ],
    finishReason: { unified: 'tool-calls' as const, raw: 'tool_calls' },
    usage: MOCK_V4_USAGE,
    warnings: [],
  };
}

/** 构造一次 Mock 模型文本完成结果。 */
function createMockTextResult(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: { unified: 'stop' as const, raw: 'stop' },
    usage: MOCK_V4_USAGE,
    warnings: [],
  };
}

/** 构造成功的 NestJS 工具 Mock 回执。 */
function createSuccessfulToolResult(
  input: NextNestWorkspaceToolInvocationInput,
  output: unknown,
): AiRuntimeToolInvocationResult {
  return {
    status: 'SUCCEEDED',
    toolCallId: input.providerToolCallId,
    output,
    events: [],
  };
}

test('官方 Agent 应串联唯一候选与决策上下文，并传递受控工具上下文', async () => {
  const invocations: NextNestWorkspaceToolInvocationInput[] = [];
  const lifecycleSteps: Array<{
    sequence: number;
    modelId: string;
    finishReason: string;
    toolCallIds: string[];
  }> = [];
  let lifecycleUsage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;
  let observedRuntimeContext: NextNestWorkspaceAgentRuntimeContext | undefined;
  const invokeTool: NextNestWorkspaceToolInvoker = async (input) => {
    invocations.push(input);

    if (input.toolName === 'findDecisionCandidates') {
      return createSuccessfulToolResult(input, {
        candidates: [
          {
            decisionId: 42,
            title: '年度预算调整',
            projectTitle: '财务规划',
            status: 'DECIDED',
            updatedAt: '2026-09-02T08:00:00.000Z',
          },
        ],
      });
    }

    return createSuccessfulToolResult(input, {
      decisionId: 42,
      title: '年度预算调整',
      status: 'DECIDED',
      projectTitle: '财务规划',
    });
  };
  const model = new MockLanguageModelV4({
    provider: 'nextnest.mock',
    modelId: 'c1-unique-model',
    doGenerate: [
      createMockToolCall('find-1', 'findDecisionCandidates', { query: '年度预算调整' }),
      createMockToolCall('context-1', 'getDecisionContext', { decisionId: 42 }),
      createMockTextResult('这项决策属于财务规划，当前状态为已决定。'),
    ],
  });

  const agent = createNextNestWorkspaceAgentCore({
    requestId: 'req-c1-unique',
    userId: 7,
    runId: 'run-c1-unique',
    executionLeaseId: 'lease-c1-unique',
    modelSettings: {
      model,
      maxOutputTokens: 8_192,
      maxRetries: 0,
      providerOptions: { gateway: { models: [], user: '7', tags: [] } },
      timeout: { totalMs: 240_000, stepMs: 180_000, chunkMs: 30_000 },
    },
    invokeTool,
    lifecycle: {
      onStepEnd: ({ stepNumber, model, finishReason, toolCalls }) => {
        lifecycleSteps.push({
          sequence: stepNumber + 1,
          modelId: model.modelId,
          finishReason,
          toolCallIds: toolCalls.map((toolCall) => toolCall.toolCallId),
        });
      },
      onEnd: ({ usage }) => {
        lifecycleUsage = usage;
      },
    },
  });
  const result = await agent.generate({
    prompt: '请说明年度预算调整这项决策。',
    onStepEnd: ({ runtimeContext }) => {
      observedRuntimeContext = runtimeContext;
    },
  });

  assert.equal(agent.id, NEXTNEST_WORKSPACE_AGENT_ID);
  assert.equal(NEXTNEST_WORKSPACE_AGENT_MAX_STEPS, 8);
  assert.deepEqual(Object.keys(agent.tools), ['findDecisionCandidates', 'getDecisionContext']);
  assert.deepEqual(observedRuntimeContext, { requestId: 'req-c1-unique', userId: 7 });
  assert.equal(result.text, '这项决策属于财务规划，当前状态为已决定。');
  assert.deepEqual(lifecycleSteps, [
    {
      sequence: 1,
      modelId: 'c1-unique-model',
      finishReason: 'tool-calls',
      toolCallIds: ['find-1'],
    },
    {
      sequence: 2,
      modelId: 'c1-unique-model',
      finishReason: 'tool-calls',
      toolCallIds: ['context-1'],
    },
    {
      sequence: 3,
      modelId: 'c1-unique-model',
      finishReason: 'stop',
      toolCallIds: [],
    },
  ]);
  assert.deepEqual(lifecycleUsage, {
    inputTokens: 30,
    inputTokenDetails: {
      noCacheTokens: 30,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    outputTokens: 15,
    outputTokenDetails: {
      textTokens: 15,
      reasoningTokens: 0,
    },
    totalTokens: 45,
  });
  assert.deepEqual(
    invocations.map(({ toolName, toolInput, runId, executionLeaseId }) => ({
      toolName,
      toolInput,
      runId,
      executionLeaseId,
    })),
    [
      {
        toolName: 'findDecisionCandidates',
        toolInput: { query: '年度预算调整' },
        runId: 'run-c1-unique',
        executionLeaseId: 'lease-c1-unique',
      },
      {
        toolName: 'getDecisionContext',
        toolInput: { decisionId: 42 },
        runId: 'run-c1-unique',
        executionLeaseId: 'lease-c1-unique',
      },
    ],
  );
  assert.equal(model.doGenerateCalls.length, 3);
});

test('空候选和重名候选都应把发现结果交回模型，不由 Web 侧猜测决策', async () => {
  for (const scenario of [
    {
      name: '空候选',
      output: { candidates: [] },
      text: '当前没有找到可访问的同名决策。',
    },
    {
      name: '重名候选',
      output: {
        candidates: [
          { decisionId: 1, title: '预算调整', projectTitle: '项目甲' },
          { decisionId: 2, title: '预算调整', projectTitle: '项目乙' },
        ],
      },
      text: '找到多项同名决策，请选择所属项目。',
    },
  ]) {
    const invocations: NextNestWorkspaceToolInvocationInput[] = [];
    const invokeTool: NextNestWorkspaceToolInvoker = async (input) => {
      invocations.push(input);
      return createSuccessfulToolResult(input, scenario.output);
    };
    const model = new MockLanguageModelV4({
      provider: 'nextnest.mock',
      modelId: `c1-${scenario.name}`,
      doGenerate: [
        createMockToolCall(`find-${scenario.name}`, 'findDecisionCandidates', { query: '预算调整' }),
        createMockTextResult(scenario.text),
      ],
    });
    const agent = createNextNestWorkspaceAgentCore({
      requestId: `req-c1-${scenario.name}`,
      userId: 7,
      runId: `run-c1-${scenario.name}`,
      executionLeaseId: `lease-c1-${scenario.name}`,
      modelSettings: {
        model,
        maxOutputTokens: 8_192,
        maxRetries: 0,
        providerOptions: { gateway: { models: [], user: '7', tags: [] } },
        timeout: { totalMs: 240_000, stepMs: 180_000, chunkMs: 30_000 },
      },
      invokeTool,
    });

    const result = await agent.generate({ prompt: `请查找${scenario.name}的预算调整决策。` });

    assert.equal(result.text, scenario.text);
    assert.equal(invocations.length, 1);
    assert.equal(invocations[0]?.toolName, 'findDecisionCandidates');
  }
});

test('非法 decisionId 应在 AI SDK 工具输入校验阶段失败，不调用 NestJS', async () => {
  const invocations: NextNestWorkspaceToolInvocationInput[] = [];
  const model = new MockLanguageModelV4({
    provider: 'nextnest.mock',
    modelId: 'c1-invalid-id-model',
    doGenerate: [createMockToolCall('invalid-1', 'getDecisionContext', { decisionId: 0 })],
  });
  const agent = createNextNestWorkspaceAgentCore({
    requestId: 'req-c1-invalid-id',
    userId: 7,
    runId: 'run-c1-invalid-id',
    executionLeaseId: 'lease-c1-invalid-id',
    modelSettings: {
      model,
      maxOutputTokens: 8_192,
      maxRetries: 0,
      providerOptions: { gateway: { models: [], user: '7', tags: [] } },
      timeout: { totalMs: 240_000, stepMs: 180_000, chunkMs: 30_000 },
    },
    invokeTool: async (input) => {
      invocations.push(input);
      return createSuccessfulToolResult(input, {});
    },
  });

  await assert.rejects(agent.generate({ prompt: '读取决策 0 的上下文。' }));
  assert.equal(invocations.length, 0);
});
