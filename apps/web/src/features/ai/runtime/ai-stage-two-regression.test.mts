/**
 * 本文件通过当前导出的上下文选择、范围路由和工具策略 API，验证 AI 第 2 阶段的关键行为边界。
 * 测试只使用 AI SDK Mock，不访问真实模型、NestJS 或数据库。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isStepCount, ToolLoopAgent, tool, type UIMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

import { DECISION_AGENT_INSTRUCTIONS } from '../agents/decision-agent-instructions.ts';
import { prepareDecisionAgentStep, routeDecisionAgentRequest } from '../agents/decision-agent-scope-policy.ts';
import { buildAiAgentContext } from '../context/agent-context-builder.server.ts';
import { AI_RECENT_MESSAGE_CHARACTER_BUDGET, AI_RECENT_MESSAGE_LIMIT } from '../context/context-budget.server.ts';
import { getDecisionContextModelInputSchema } from '../tools/decision/get-decision-context.schema.ts';

/** Mock 模型共用的确定性 Token 用量。 */
const MOCK_STAGE_TWO_USAGE = {
  inputTokens: {
    total: 12,
    noCache: 12,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 8,
    text: 8,
    reasoning: 0,
  },
};

/** 创建仅包含纯文本的最小 UI 消息。 */
function createTextMessage(index: number, text: string): UIMessage {
  return {
    id: `message-${index}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    parts: [{ type: 'text', text }],
  };
}

/** 使用生产范围策略运行一个不会接触真实业务数据的测试 Agent。 */
function createPolicyTestAgent(options: {
  model: MockLanguageModelV4;
  question: string;
  onToolExecute?: (input: { decisionId: number }) => void;
}) {
  const route = routeDecisionAgentRequest(options.question);

  return new ToolLoopAgent({
    model: options.model,
    instructions: DECISION_AGENT_INSTRUCTIONS,
    tools: {
      getDecisionContext: tool({
        description: '返回当前 Run 已确认范围内的测试决策上下文',
        inputSchema: getDecisionContextModelInputSchema,
        execute: async (input) => {
          options.onToolExecute?.(input);
          return {
            decision: {
              id: 5001,
              title: '客服平台供应商选型',
            },
          };
        },
      }),
    },
    maxRetries: 0,
    stopWhen: isStepCount(2),
    prepareStep: ({ stepNumber }) => prepareDecisionAgentStep(route, stepNumber),
  });
}

test('基础上下文应优先保留最近消息并同时受条数与 Unicode 字符预算约束', () => {
  const messages = Array.from({ length: AI_RECENT_MESSAGE_LIMIT + 2 }, (_, index) =>
    createTextMessage(index, `消息-${index}`),
  );
  const limitedByCount = buildAiAgentContext(messages);

  assert.deepEqual(
    limitedByCount.messages.map((message) => message.content),
    messages.slice(-AI_RECENT_MESSAGE_LIMIT).map((message) => `消息-${message.id.split('-')[1]}`),
  );
  assert.equal(limitedByCount.truncated, true);

  const latestQuestion = '最新问题：为什么形成这项决策？';
  const limitedByBudget = buildAiAgentContext([
    createTextMessage(0, '旧'.repeat(AI_RECENT_MESSAGE_CHARACTER_BUDGET)),
    createTextMessage(1, latestQuestion),
  ]);

  assert.deepEqual(limitedByBudget.messages, [{ role: 'assistant', content: latestQuestion }]);
  assert.ok(limitedByBudget.selectedCharacters <= AI_RECENT_MESSAGE_CHARACTER_BUDGET);
  assert.equal(limitedByBudget.truncated, true);

  const oversizedLatest = buildAiAgentContext([
    createTextMessage(2, '😀'.repeat(AI_RECENT_MESSAGE_CHARACTER_BUDGET + 1)),
  ]);

  assert.equal(Array.from(String(oversizedLatest.messages[0]?.content)).length, AI_RECENT_MESSAGE_CHARACTER_BUDGET);
  assert.equal(oversizedLatest.selectedCharacters, AI_RECENT_MESSAGE_CHARACTER_BUDGET);
});

test('范围路由应拒绝明确离题请求，但不能因决策问题包含技术词而误拒', () => {
  const offTopicCases = [
    ['给我写一篇 React Hooks 入门教程。', 'software-help'],
    ['今天杭州天气怎么样？', 'weather'],
    ['帮我写一封通用求职邮件。', 'general-writing'],
    ['生成一个与当前决策无关的 TypeScript 排序函数。', 'software-help'],
  ] as const;

  for (const [question, category] of offTopicCases) {
    assert.deepEqual(routeDecisionAgentRequest(question), {
      mode: 'scope-refusal',
      category,
    });
  }

  assert.deepEqual(routeDecisionAgentRequest('这项决策为什么选择 React 而不是 Vue？'), {
    mode: 'decision',
  });
});

test('离题请求进入 Agent 后不得向模型暴露或执行决策工具', async () => {
  const question = '生成一个与当前决策无关的 TypeScript 排序函数。';
  let toolExecutionCount = 0;
  const model = new MockLanguageModelV4({
    provider: 'nextnest.mock',
    modelId: 'mock-stage-two-scope-refusal',
    doGenerate: {
      content: [
        {
          type: 'text',
          text: '这个问题与当前决策形成过程无关。我只能协助当前决策的讨论、提案、投票、决议和过程回放。',
        },
      ],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: MOCK_STAGE_TWO_USAGE,
      warnings: [],
    },
  });
  const agent = createPolicyTestAgent({
    model,
    question,
    onToolExecute: () => {
      toolExecutionCount += 1;
    },
  });
  const result = await agent.generate({ prompt: question });

  assert.match(result.text, /当前决策形成过程无关/u);
  assert.equal(model.doGenerateCalls.length, 1);
  assert.equal(model.doGenerateCalls[0]?.tools?.length ?? 0, 0);
  assert.equal(toolExecutionCount, 0);
});

test('标题比较应保留原始标点并让模型取得当前 Thread 的真实标题', async () => {
  const exactQuestion = '当前决策标题是否与“客服平台供应商选型”完全一致？';
  const punctuationQuestion = '当前决策标题是否与“客服平台供应商选型。”完全一致？';

  /** 运行一次标题比较，并返回真实经过 Agent 的模型调用记录。 */
  async function runComparison(question: string, answer: string) {
    let toolExecutionCount = 0;
    const model = new MockLanguageModelV4({
      provider: 'nextnest.mock',
      modelId: 'mock-stage-two-title-comparison',
      doGenerate: [
        {
          content: [
            {
              type: 'tool-call',
              toolCallId: 'decision-context-1',
              toolName: 'getDecisionContext',
              input: '{"decisionId":5001}',
            },
          ],
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          usage: MOCK_STAGE_TWO_USAGE,
          warnings: [],
        },
        {
          content: [{ type: 'text', text: answer }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: MOCK_STAGE_TWO_USAGE,
          warnings: [],
        },
      ],
    });
    const agent = createPolicyTestAgent({
      model,
      question,
      onToolExecute: () => {
        toolExecutionCount += 1;
      },
    });
    const result = await agent.generate({ prompt: question });

    return { model, result, toolExecutionCount };
  }

  const exact = await runComparison(exactQuestion, '逐字符比较后完全一致。');
  const punctuation = await runComparison(punctuationQuestion, '逐字符比较后不完全一致，候选标题多了句号。');

  assert.match(exact.result.text, /完全一致/u);
  assert.match(punctuation.result.text, /不完全一致/u);
  assert.equal(exact.toolExecutionCount, 1);
  assert.equal(punctuation.toolExecutionCount, 1);

  const exactPrompt = JSON.stringify(exact.model.doGenerateCalls);
  const punctuationPrompt = JSON.stringify(punctuation.model.doGenerateCalls);

  assert.ok(exactPrompt.includes(exactQuestion));
  assert.ok(punctuationPrompt.includes(punctuationQuestion));
  assert.ok(punctuationPrompt.includes('客服平台供应商选型'));
  assert.match(punctuationPrompt, /逐个 Unicode 字符精确比较/u);
});

test('多决策 Run 允许工具选择已确认 Decision，但提示词不能扩大服务端范围', () => {
  const switchQuestion = '比较已确认的决策 5001 和决策 5002。';
  const route = routeDecisionAgentRequest(switchQuestion);

  assert.deepEqual(route, { mode: 'decision' });
  assert.deepEqual(prepareDecisionAgentStep(route, 0), {
    activeTools: ['getDecisionContext'],
    toolChoice: {
      type: 'tool',
      toolName: 'getDecisionContext',
    },
  });
  assert.deepEqual(getDecisionContextModelInputSchema.parse({ decisionId: 5002 }), {
    decisionId: 5002,
  });
  assert.equal(getDecisionContextModelInputSchema.safeParse({}).success, false);
  assert.match(DECISION_AGENT_INSTRUCTIONS, /不得读取未出现在当前 Run 已确认范围中的 ID/u);
});

test('一个 Run 可以在同一 Agent Step 读取两个已确认决策后生成比较回答', async () => {
  const executedDecisionIds: number[] = [];
  const model = new MockLanguageModelV4({
    provider: 'nextnest.mock',
    modelId: 'mock-stage-two-multi-decision',
    doGenerate: [
      {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'decision-context-5001',
            toolName: 'getDecisionContext',
            input: '{"decisionId":5001}',
          },
          {
            type: 'tool-call',
            toolCallId: 'decision-context-5002',
            toolName: 'getDecisionContext',
            input: '{"decisionId":5002}',
          },
        ],
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage: MOCK_STAGE_TWO_USAGE,
        warnings: [],
      },
      {
        content: [{ type: 'text', text: '已基于两个已确认决策的工具结果完成比较。' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: MOCK_STAGE_TWO_USAGE,
        warnings: [],
      },
    ],
  });
  const agent = createPolicyTestAgent({
    model,
    question: '比较已确认的决策 5001 和决策 5002。',
    onToolExecute: ({ decisionId }) => executedDecisionIds.push(decisionId),
  });
  const result = await agent.generate({ prompt: '比较已确认的决策 5001 和决策 5002。' });

  assert.deepEqual(
    executedDecisionIds.sort((left, right) => left - right),
    [5001, 5002],
  );
  assert.match(result.text, /两个已确认决策/u);
});
