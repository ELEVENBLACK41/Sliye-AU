/**
 * AI Run 领域事件归约器回归测试。
 * 验证序号去重、乱序缓存、工具状态和未知事件的保守处理。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createAiEventReducerState, reduceAiEvent } from './ai-event-reducer.ts';

/** 创建测试用的最小领域事件。 */
function createEvent(sequence: number, type: string, data: unknown) {
  return {
    id: `event-${sequence}`,
    runId: 'run-1',
    sequence,
    type,
    data,
    createdAt: '2026-08-26T00:00:00.000Z',
  };
}

test('相同 runId 与 sequence 的事件只应用一次', () => {
  const initial = createAiEventReducerState('run-1', { status: 'RUNNING' });
  const event = createEvent(1, 'ASSISTANT_TEXT_DELTA', { messageId: 'message-1', delta: '你好' });

  const once = reduceAiEvent(initial, event);
  const twice = reduceAiEvent(once, event);

  assert.equal(twice.lastSequence, 1);
  assert.equal(twice.assistantText, '你好');
});

test('乱序事件会等待前序事件并按 sequence 连续应用', () => {
  const initial = createAiEventReducerState('run-1', { status: 'RUNNING' });
  const second = createEvent(2, 'ASSISTANT_TEXT_DELTA', { messageId: 'message-1', delta: '世界' });
  const first = createEvent(1, 'ASSISTANT_TEXT_DELTA', { messageId: 'message-1', delta: '你好' });

  const waiting = reduceAiEvent(initial, second);
  const completed = reduceAiEvent(waiting, first);

  assert.equal(waiting.lastSequence, 0);
  assert.equal(completed.lastSequence, 2);
  assert.equal(completed.assistantText, '你好世界');
});

test('工具状态会从运行中收敛到失败，未知事件不会伪装成完成', () => {
  const initial = createAiEventReducerState('run-1', { status: 'RUNNING' });
  const started = createEvent(1, 'TOOL_CALL_STARTED', {
    toolCallId: 'tool-1',
    toolName: 'findDecisionCandidates',
    input: { query: '预算决策' },
  });
  const settled = createEvent(2, 'TOOL_CALL_SETTLED', {
    toolCallId: 'tool-1',
    toolName: 'findDecisionCandidates',
    status: 'FAILED',
    outputSummary: null,
    failureCode: 'AI.TOOL_EXECUTION_FAILED',
    failureReason: '工具执行失败',
    durationMs: 12,
  });
  const unknown = createEvent(3, 'FUTURE_EVENT', { status: 'COMPLETED' });

  const next = reduceAiEvent(reduceAiEvent(reduceAiEvent(initial, started), settled), unknown);

  assert.equal(next.status, 'RUNNING');
  assert.equal(next.toolCalls[0]?.status, 'FAILED');
  assert.equal(next.lastSequence, 3);
  assert.equal(next.diagnostics.length, 1);
  assert.match(next.diagnostics[0] ?? '', /未知 AI 事件类型/);
});
