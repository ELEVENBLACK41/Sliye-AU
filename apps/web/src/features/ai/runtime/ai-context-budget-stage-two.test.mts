/**
 * 本文件验证第 2.4 阶段 Agent 最近消息上下文的条数与字符硬预算。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildAiAgentContext } from '../context/agent-context-builder.server.ts';
import { AI_RECENT_MESSAGE_CHARACTER_BUDGET, AI_RECENT_MESSAGE_LIMIT } from '../context/context-budget.server.ts';
import { getDecisionContextModelInputSchema } from '../tools/decision/get-decision-context.schema.ts';

/** 创建仅包含纯文本的最小 UI 消息。 */
function createTextMessage(index: number, text: string) {
  return {
    id: `message-${index}`,
    role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
    parts: [{ type: 'text' as const, text }],
  };
}

test('基础上下文只选择最近八条消息并保持原顺序', () => {
  const selection = buildAiAgentContext(
    Array.from({ length: AI_RECENT_MESSAGE_LIMIT + 2 }, (_, index) => createTextMessage(index, `消息-${index}`)),
  );

  assert.equal(selection.messages.length, AI_RECENT_MESSAGE_LIMIT);
  assert.equal(selection.truncated, true);
  assert.equal(selection.messages[0]?.content, '消息-2');
  assert.equal(selection.messages.at(-1)?.content, '消息-9');
});

test('单条超长最新消息也不会突破字符预算或被整体丢弃', () => {
  const oversizedText = '决'.repeat(AI_RECENT_MESSAGE_CHARACTER_BUDGET + 100);
  const selection = buildAiAgentContext([createTextMessage(0, oversizedText)]);

  assert.equal(selection.messages.length, 1);
  assert.equal(selection.selectedCharacters, AI_RECENT_MESSAGE_CHARACTER_BUDGET);
  assert.equal(String(selection.messages[0]?.content).length, AI_RECENT_MESSAGE_CHARACTER_BUDGET);
  assert.equal(selection.truncated, true);
});

test('决策上下文工具不得接受模型指定或覆盖 Decision ID', () => {
  assert.deepEqual(getDecisionContextModelInputSchema.parse({}), {});
  assert.equal(getDecisionContextModelInputSchema.safeParse({ decisionId: 1 }).success, false);
});
