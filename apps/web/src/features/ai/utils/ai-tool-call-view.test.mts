/**
 * 本文件验证首次流与历史恢复使用同一套工具卡状态和脱敏摘要。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AiRunPublicSummary, AiToolCall } from '@workspace/contracts/ai';

import {
  createWaitingAiToolCallView,
  toHistoricalAiToolCallView,
  toLiveAiToolCallView,
  type AiLiveDecisionContextToolPart,
} from './ai-tool-call-view.ts';

const TIMESTAMP = '2026-08-23T10:00:00.000Z';

/** 创建实时工具部件，并让每个测试只覆盖状态投影所需字段。 */
function createLivePart(
  state: AiLiveDecisionContextToolPart['state'],
  fields: Record<string, unknown> = {},
): AiLiveDecisionContextToolPart {
  return {
    type: 'tool-getDecisionContext',
    toolCallId: `live-${state}`,
    state,
    ...fields,
  } as unknown as AiLiveDecisionContextToolPart;
}

/** 创建历史 Run 状态夹具。 */
function createRun(overrides: Partial<AiRunPublicSummary> = {}): AiRunPublicSummary {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    userMessageId: 'message-1',
    retryOfRunId: null,
    status: 'RUNNING',
    modelRole: 'standard',
    resolvedModelId: 'mock/model',
    cancellationReason: null,
    failureReason: null,
    failureCode: null,
    usage: null,
    startedAt: TIMESTAMP,
    finishedAt: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

/** 创建历史工具调用夹具。 */
function createToolCall(overrides: Partial<AiToolCall> = {}): AiToolCall {
  return {
    id: 'tool-record-1',
    runId: 'run-1',
    toolCallId: 'tool-call-1',
    sequence: 1,
    toolName: 'getDecisionContext',
    status: 'RUNNING',
    input: { decisionId: 7 },
    resultSummary: null,
    errorCode: null,
    startedAt: TIMESTAMP,
    finishedAt: null,
    durationMs: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

test('首次流工具状态应覆盖等待、运行、审批、成功、失败和取消', () => {
  const liveCases = [
    [createLivePart('input-streaming'), 'waiting'],
    [createLivePart('input-available', { input: { decisionId: 7 } }), 'running'],
    [createLivePart('approval-responded', { input: { decisionId: 7 } }), 'running'],
    [createLivePart('approval-requested', { input: { decisionId: 7 } }), 'waiting_approval'],
    [createLivePart('output-error', { input: { decisionId: 7 }, errorText: 'AI_TOOL_FAILED' }), 'failed'],
    [createLivePart('output-denied', { input: { decisionId: 7 } }), 'cancelled'],
  ] as const;

  for (const [part, expectedState] of liveCases) {
    assert.equal(toLiveAiToolCallView(part).state, expectedState);
  }

  const success = toLiveAiToolCallView(
    createLivePart('output-available', {
      input: { decisionId: 7 },
      output: {
        decision: {
          id: 7,
          title: '客服平台供应商选型',
          description: '不应进入工具卡摘要的完整描述',
          status: 'DISCUSSING',
          participantCount: 4,
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        },
        project: { id: 3, title: 'NextNest' },
        area: { id: 2, name: '产品讨论区', type: 'PUBLIC' },
        department: { id: 1, code: 'PRODUCT', name: '产品部' },
        sources: [
          {
            sourceId: 'decision:7',
            sourceType: 'DECISION',
            title: '客服平台供应商选型',
          },
        ],
      },
    }),
  );

  assert.equal(success.state, 'success');
  assert.deepEqual(success.inputSummary, { decisionId: 7 });
  assert.deepEqual(success.resultSummary, {
    decisionId: 7,
    decisionTitle: '客服平台供应商选型',
    decisionStatus: 'DISCUSSING',
    projectTitle: 'NextNest',
    areaName: '产品讨论区',
    participantCount: 4,
    sourceIds: ['decision:7'],
  });
  assert.deepEqual(success.sourceIds, ['decision:7']);
  assert.equal('description' in success.resultSummary!, false);
  assert.equal(toLiveAiToolCallView(liveCases[4][0]).errorCode, 'AI_TOOL_FAILED');
});

test('历史工具状态应由审计状态和父 Run 终态共同恢复', () => {
  const historicalCases = [
    [createToolCall(), createRun(), 'running'],
    [
      createToolCall({ status: 'WAITING', startedAt: null }),
      createRun({ status: 'RUNNING' }),
      'waiting',
    ],
    [
      createToolCall({ status: 'COMPLETED' }),
      createRun({ status: 'COMPLETED', finishedAt: TIMESTAMP }),
      'success',
    ],
    [
      createToolCall({ status: 'FAILED', errorCode: 'AI_TOOL_FAILED' }),
      createRun({ status: 'FAILED', failureReason: 'TOOL_ERROR', finishedAt: TIMESTAMP }),
      'failed',
    ],
    [
      createToolCall(),
      createRun({ status: 'FAILED', failureReason: 'MODEL_ERROR', finishedAt: TIMESTAMP }),
      'failed',
    ],
    [
      createToolCall(),
      createRun({
        status: 'CANCELLED',
        cancellationReason: 'USER_REQUESTED',
        finishedAt: TIMESTAMP,
      }),
      'cancelled',
    ],
    [createToolCall(), createRun({ status: 'CANCELLATION_REQUESTED' }), 'running'],
    [createToolCall(), createRun({ status: 'WAITING_APPROVAL' }), 'waiting_approval'],
  ] as const;

  for (const [toolCall, run, expectedState] of historicalCases) {
    assert.equal(toHistoricalAiToolCallView(toolCall, run).state, expectedState);
  }
});

test('持久化等待态应以同一工具调用 ID 恢复首次流卡片', () => {
  const toolCallId = 'stable-waiting-tool-call';
  const live = toLiveAiToolCallView(
    createLivePart('input-streaming', { toolCallId }),
  );
  const historical = toHistoricalAiToolCallView(
    createToolCall({
      toolCallId,
      status: 'WAITING',
      startedAt: null,
    }),
    createRun({ status: 'RUNNING' }),
  );

  assert.equal(live.id, toolCallId);
  assert.equal(historical.id, toolCallId);
  assert.equal(live.state, 'waiting');
  assert.equal(historical.state, live.state);
  assert.deepEqual(historical.inputSummary, { decisionId: 7 });
});

test('历史工具成功摘要和排队等待卡只能暴露受控字段', () => {
  const resultSummary = {
    decisionId: 7,
    decisionTitle: '客服平台供应商选型',
    decisionStatus: 'DISCUSSING',
    projectTitle: 'NextNest',
    areaName: null,
    participantCount: 4,
    sourceIds: ['decision:7'],
  };
  const historical = toHistoricalAiToolCallView(
    createToolCall({
      status: 'COMPLETED',
      resultSummary,
      finishedAt: TIMESTAMP,
      durationMs: 25,
    }),
    createRun({ status: 'COMPLETED', finishedAt: TIMESTAMP }),
  );
  const waiting = createWaitingAiToolCallView('run-queued');

  assert.deepEqual(historical.resultSummary, resultSummary);
  assert.deepEqual(historical.sourceIds, ['decision:7']);
  assert.equal(historical.durationMs, 25);
  assert.deepEqual(waiting, {
    id: 'waiting-run-queued',
    title: '读取决策基础上下文',
    state: 'waiting',
    inputSummary: null,
    resultSummary: null,
    errorCode: null,
    durationMs: null,
    sourceIds: [],
  });
});
