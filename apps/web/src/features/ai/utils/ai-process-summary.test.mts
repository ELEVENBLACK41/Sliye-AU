/**
 * AI 阶段摘要回归测试。
 * 验证工具状态能转换为安全中文文案，且未知工具不会把内部名称泄漏给用户。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { AiMessageRun } from '@workspace/contracts/ai';

import { toAiProcessSummary } from './ai-process-summary.ts';

/** 创建包含单条工具调用的最小 Run 展示快照。 */
function createRun(toolName: string, status: AiMessageRun['toolCalls'][number]['status']): AiMessageRun {
  return {
    runId: 'run-1',
    status: status === 'RUNNING' ? 'RUNNING' : 'COMPLETED',
    failureReason: null,
    failureCode: null,
    cancellationReason: null,
    toolCalls: [
      {
        id: 'tool-1',
        toolName,
        status,
        durationMs: status === 'RUNNING' ? null : 12,
        failureCode: status === 'FAILED' ? 'AI.TOOL_EXECUTION_FAILED' : null,
        failureReason: status === 'FAILED' ? '工具执行失败' : null,
        webSources: [],
      },
    ],
  };
}

test('已知决策工具生成阶段摘要并保留运行状态', () => {
  assert.deepEqual(toAiProcessSummary(createRun('findDecisionCandidates', 'RUNNING')), {
    text: '正在确认可访问的决策',
    isRunning: true,
  });
  assert.deepEqual(toAiProcessSummary(createRun('getDecisionContext', 'SUCCEEDED')), {
    text: '已完成决策信息读取',
    isRunning: false,
  });
});

test('未知工具使用中性文案，不展示内部工具名', () => {
  const summary = toAiProcessSummary(createRun('internalFutureTool', 'FAILED'));

  assert.deepEqual(summary, { text: '只读查询未完成', isRunning: false });
  assert.equal(summary?.text.includes('internalFutureTool'), false);
});

test('没有工具调用时不生成阶段摘要', () => {
  assert.equal(
    toAiProcessSummary({
      ...createRun('findDecisionCandidates', 'SUCCEEDED'),
      toolCalls: [],
    }),
    null,
  );
});
