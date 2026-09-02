/**
 * AI 工作区消息适配回归测试。
 * 验证实时助手正文、失败状态和来源失权投影不会在浏览器侧被误还原。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { AiMessageHistoryItem } from '@workspace/contracts/ai';

import { createAiEventReducerState, reduceAiEvent } from './ai-event-reducer.ts';
import { toAiWorkspaceMessages, toAiWorkspaceQueuedMessages } from './ai-workspace-message.ts';

/** 创建一条测试用的持久化消息。 */
function createMessage(overrides: Partial<AiMessageHistoryItem> = {}): AiMessageHistoryItem {
  return {
    id: 'message-1',
    threadId: 'thread-1',
    runId: null,
    authorUserId: 1,
    role: 'USER',
    dispatchState: 'DISPATCHED',
    queueSequence: 1,
    submissionMode: 'NORMAL',
    content: '原始问题',
    parts: [{ type: 'text', text: '原始问题' }],
    metadata: null,
    createdAt: '2026-08-26T00:00:00.000Z',
    run: null,
    contentVisibility: 'VISIBLE',
    ...overrides,
  };
}

test('实时助手文本会覆盖同一稳定消息并保留运行状态', () => {
  const liveState = reduceAiEvent(
    createAiEventReducerState('run-1', { status: 'RUNNING' }),
    {
      runId: 'run-1',
      sequence: 1,
      type: 'ASSISTANT_TEXT_DELTA',
      data: { messageId: 'assistant-1', delta: '正在分析' },
    },
  );

  const messages = toAiWorkspaceMessages(
    [
      createMessage(),
      createMessage({
        id: 'assistant-1',
        role: 'ASSISTANT',
        runId: 'run-1',
        run: {
          runId: 'run-1',
          status: 'RUNNING',
          failureReason: null,
          failureCode: null,
          cancellationReason: null,
          toolCalls: [],
        },
        content: '',
      }),
    ],
    liveState,
  );

  assert.equal(messages[1]?.content, '正在分析');
  assert.equal(messages[1]?.isStreaming, true);
  assert.equal(messages[1]?.run?.status, 'RUNNING');
});

test('失败回答保留失败状态，不被适配成完成消息', () => {
  const messages = toAiWorkspaceMessages(
    [
      createMessage(),
      createMessage({
        id: 'assistant-1',
        role: 'ASSISTANT',
        runId: 'run-1',
        content: '',
        run: {
          runId: 'run-1',
          status: 'FAILED',
          failureReason: 'MODEL_ERROR',
          failureCode: 'AI.MODEL_UNAVAILABLE',
          cancellationReason: null,
          toolCalls: [],
        },
      }),
    ],
    null,
  );

  assert.equal(messages[1]?.run?.status, 'FAILED');
  assert.equal(messages[1]?.isStreaming, false);
});

test('来源失权消息只保留中性占位并清空工具摘要', () => {
  const messages = toAiWorkspaceMessages(
    [
      createMessage({
        id: 'assistant-1',
        role: 'ASSISTANT',
        runId: 'run-1',
        content: '',
        contentVisibility: 'SOURCE_REVOKED',
        run: {
          runId: 'run-1',
          status: 'COMPLETED',
          failureReason: null,
          failureCode: null,
          cancellationReason: null,
          toolCalls: [],
        },
      }),
    ],
    null,
  );

  assert.equal(messages[0]?.content, '这条回答当前无法显示。');
  assert.equal(messages[0]?.contentVisibility, 'SOURCE_REVOKED');
  assert.deepEqual(messages[0]?.run?.toolCalls, []);
});

test('排队用户输入从对话消息中移到输入框上方，并合并本地提交确认', () => {
  const queued = createMessage({
    id: 'message-queued',
    dispatchState: 'QUEUED',
    queueSequence: 2,
    content: '排队的问题',
  });
  const local = toAiWorkspaceQueuedMessages(
    [queued],
    [
      {
        id: 'message-local',
        content: '刚提交的问题',
        queueSequence: 3,
        submissionMode: 'NORMAL',
        isSteering: false,
      },
    ],
    null,
  );

  assert.deepEqual(local.map((message) => [message.id, message.queueSequence]), [
    ['message-queued', 2],
    ['message-local', 3],
  ]);
  assert.deepEqual(toAiWorkspaceMessages([queued], null), []);
});

test('本地调整方向确认会暂时隐藏历史中的旧排队项，等待下一次历史刷新', () => {
  const queued = createMessage({
    id: 'message-queued-old',
    queueSequence: 2,
    content: '旧排队问题',
    dispatchState: 'QUEUED',
  });
  const latest = toAiWorkspaceQueuedMessages(
    [queued],
    [
      {
        id: 'message-steer',
        content: '新的调整方向',
        queueSequence: 3,
        submissionMode: 'STEER',
        isSteering: true,
      },
    ],
    'run-1',
  );

  assert.deepEqual(latest.map((message) => message.id), ['message-steer']);
});
